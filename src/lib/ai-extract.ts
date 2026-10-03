import 'server-only'

/** Max bytes we will accept for an AI document upload. Keeps token cost bounded. */
export const AI_UPLOAD_MAX_BYTES = 10 * 1024 * 1024 // 10 MB
export const AI_UPLOAD_ALLOWED = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/tiff',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
  'text/plain',
  'application/csv',
])

export type ExtractedDoc =
  | {
      kind: 'pdf'
      text: string
      pages: number
      truncated: boolean
    }
  | {
      kind: 'image'
      base64: string // without data: prefix
      mimeType: string
      // placeholder text so the LLM still gets a text fallback even before vision
      text: string
    }
  | {
      kind: 'sheet'
      headers: string[]
      rows: Record<string, unknown>[] // capped for LLM + charts
      totalRows: number
      sheetName: string
      /** Human-readable preview fed to the LLM (markdown table). */
      previewText: string
      truncated: boolean
    }
  | {
      kind: 'text'
      text: string
      truncated: boolean
    }

function truncateText(s: string, max = 14_000): { text: string; truncated: boolean } {
  if (s.length <= max) return { text: s, truncated: false }
  return { text: s.slice(0, max) + '\n\n[— truncated: document longer than preview limit —]', truncated: true }
}

// Minimal CSV parser — handles quoted fields, good enough for AI preview (not RFC-perfect).
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let cur: string[] = []
  let field = ''
  let inQuote = false
  let i = 0
  while (i < text.length) {
    const ch = text[i]
    if (inQuote) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue }
        inQuote = false; i++; continue
      }
      field += ch; i++; continue
    }
    if (ch === '"') { inQuote = true; i++; continue }
    if (ch === ',') { cur.push(field); field = ''; i++; continue }
    if (ch === '\n') { cur.push(field); rows.push(cur); cur = []; field = ''; i++; continue }
    if (ch === '\r') { // ignore \r, handle \r\n
      if (text[i + 1] === '\n') i++
      cur.push(field); rows.push(cur); cur = []; field = ''; i++; continue
    }
    field += ch; i++
  }
  cur.push(field); rows.push(cur)
  // drop trailing empty row from final newline
  if (rows.length && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === '') rows.pop()
  return rows
}

export async function extractDocument(file: File, buffer: Buffer): Promise<ExtractedDoc> {
  const mime = (file.type || '').toLowerCase()
  const name = file.name || 'upload'

  // ---------- PDF ----------
  if (mime === 'application/pdf') {
    // pdf-parse 1.1.1's index.js has a debug side-effect: when `!module.parent`
    // (true under ESM/Next.js) it does `Fs.readFileSync('./test/data/05-versions-space.pdf')`
    // and throws ENOENT. Import the lib directly to bypass it.
    const mod = await import('pdf-parse/lib/pdf-parse.js')
    const pdf =
      (mod as unknown as { default: (b: Buffer) => Promise<{ text: string; numpages: number }> }).default ??
      (mod as unknown as (b: Buffer) => Promise<{ text: string; numpages: number }>)
    const data = await pdf(buffer)
    const raw = (data.text ?? '').trim()
    const { text, truncated } = truncateText(raw || '[No extractable text in PDF]')
    return { kind: 'pdf', text, pages: data.numpages ?? 1, truncated }
  }

  // ---------- Image (vision) ----------
  if (mime.startsWith('image/')) {
    const base64 = buffer.toString('base64')
    // LLM still gets a textual hint; real understanding comes from the vision part.
    return {
      kind: 'image',
      base64,
      mimeType: mime,
      text: `[Image: ${name} — ${mime}, ${(buffer.length / 1024).toFixed(1)} KB. Content will be analysed visually.]`,
    }
  }

  // ---------- Excel (.xlsx / .xls) ----------
  if (
    mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mime === 'application/vnd.ms-excel' ||
    name.toLowerCase().endsWith('.xlsx') ||
    name.toLowerCase().endsWith('.xls')
  ) {
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (wb.xlsx as any).load(buffer)
    const ws = wb.worksheets[0]
    if (!ws) {
      return { kind: 'sheet', headers: [], rows: [], totalRows: 0, sheetName: 'Sheet1', previewText: '[Empty workbook]', truncated: false }
    }
    const sheetName = ws.name || 'Sheet1'
    const rawRows: unknown[][] = []
    ws.eachRow((row) => {
      // row.values is 1-indexed sparse array
      const vals = (row.values as unknown[]) ?? []
      const arr: unknown[] = []
      for (let c = 1; c < vals.length; c++) arr.push(vals[c])
      // keep rows up to 100 for LLM
      if (rawRows.length < 120) rawRows.push(arr)
    })
    // first non-empty row is header
    let headerIdx = 0
    while (headerIdx < rawRows.length && rawRows[headerIdx].every((v) => v == null || String(v).trim() === '')) headerIdx++
    const headers: string[] = headerIdx < rawRows.length
      ? (rawRows[headerIdx] as unknown[]).map((v, i) => String(v ?? '').trim() || `col_${i + 1}`)
      : []
    const dataRows = rawRows.slice(headerIdx + 1).filter((r) => (r as unknown[]).some((v) => v != null && String(v).trim() !== ''))
    const MAX_ROWS = 80
    const truncated = dataRows.length > MAX_ROWS
    const capped = dataRows.slice(0, MAX_ROWS)
    const rows: Record<string, unknown>[] = capped.map((r) => {
      const obj: Record<string, unknown> = {}
      const arr = r as unknown[]
      headers.forEach((h, i) => { obj[h] = arr[i] ?? '' })
      // if headers empty, fall back to generic keys
      if (!headers.length) arr.forEach((v, i) => { obj[`col_${i + 1}`] = v ?? '' })
      return obj
    })
    // Effective headers when file had no header row
    const effHeaders = headers.length ? headers : (rows[0] ? Object.keys(rows[0]) : [])
    // Build markdown preview for LLM (header + up to 25 rows)
    const previewRows = rows.slice(0, 25)
    const mdHeader = `| ${effHeaders.join(' | ')} |`
    const mdSep = `| ${effHeaders.map(() => '---').join(' | ')} |`
    const mdBody = previewRows.map((r) => `| ${effHeaders.map((h) => String(r[h] ?? '').replace(/\|/g, '\\|').slice(0, 60)).join(' | ')} |`).join('\n')
    const previewText = effHeaders.length
      ? `${mdHeader}\n${mdSep}\n${mdBody}${truncated ? `\n\n[— ${dataRows.length - MAX_ROWS} more rows truncated —]` : ''}`
      : '[No tabular data detected]'
    return {
      kind: 'sheet',
      headers: effHeaders,
      rows,
      totalRows: dataRows.length,
      sheetName,
      previewText,
      truncated,
    }
  }

  // ---------- CSV / plain text ----------
  if (mime === 'text/csv' || mime === 'application/csv' || name.toLowerCase().endsWith('.csv')) {
    const text = buffer.toString('utf-8')
    const grid = parseCsv(text)
    const headers = (grid[0] ?? []).map((h, i) => h.trim() || `col_${i + 1}`)
    const dataRows = grid.slice(1).filter((r) => r.some((v) => v.trim() !== ''))
    const MAX_ROWS = 80
    const truncated = dataRows.length > MAX_ROWS
    const capped = dataRows.slice(0, MAX_ROWS)
    const rows: Record<string, unknown>[] = capped.map((r) => {
      const obj: Record<string, unknown> = {}
      headers.forEach((h, i) => { obj[h] = r[i] ?? '' })
      return obj
    })
    const mdHeader = `| ${headers.join(' | ')} |`
    const mdSep = `| ${headers.map(() => '---').join(' | ')} |`
    const mdBody = capped.slice(0, 25).map((r) => `| ${headers.map((h) => String(r[headers.indexOf(h)] ?? '').replace(/\|/g, '\\|').slice(0, 60)).join(' | ')} |`).join('\n')
    const previewText = headers.length ? `${mdHeader}\n${mdSep}\n${mdBody}${truncated ? `\n\n[— ${dataRows.length - MAX_ROWS} more rows truncated —]` : ''}` : truncateText(text).text
    return {
      kind: 'sheet',
      headers,
      rows,
      totalRows: dataRows.length,
      sheetName: name.replace(/\.[^.]+$/, '') || 'CSV',
      previewText,
      truncated,
    }
  }

  // Fallback: treat as UTF-8 text
  const raw = buffer.toString('utf-8').trim()
  const { text, truncated } = truncateText(raw || '[Empty file]')
  return { kind: 'text', text, truncated }
}

export function extractedToPromptSnippet(doc: ExtractedDoc, fileName: string): string {
  if (doc.kind === 'pdf') {
    return `=== Uploaded PDF: ${fileName} (${doc.pages} page${doc.pages === 1 ? '' : 's'}) ===\n${doc.text}`
  }
  if (doc.kind === 'image') {
    return `=== Uploaded Image: ${fileName} (${doc.mimeType}) ===\n${doc.text}\n[The image itself is also sent as a vision input — describe and analyse what you see.]`
  }
  if (doc.kind === 'sheet') {
    return `=== Uploaded Spreadsheet: ${fileName} — sheet "${doc.sheetName}" (${doc.totalRows} rows, ${doc.headers.length} columns) ===\nColumns: ${doc.headers.join(', ') || '(none)'}\n\nPreview (markdown table, up to 25 rows):\n${doc.previewText}`
  }
  return `=== Uploaded File: ${fileName} ===\n${doc.text}`
}
