/**
 * Minimal CSV serializer — quotes any field containing a comma, quote, or
 * newline, doubling embedded quotes per RFC 4180. No external dependency
 * needed for something this small.
 *
 * No `import 'server-only'` here despite being used exclusively from API
 * routes — `toCSV` is pure text formatting and `csvResponse` only wraps
 * the standard Fetch `Response` object, neither touches anything secret,
 * so there's nothing for that marker to protect. Keeping it marker-free
 * also lets `toCSV` be unit-tested directly — see csv.test.ts.
 */
export interface CsvColumn<T> {
  key: keyof T & string
  header: string
  /** When true, the cell is wrapped in the Excel `="..."` text form so values
   * like phone numbers are never re-parsed as numbers (no scientific notation,
   * no leading-zero loss). Empty values stay empty. */
  asText?: boolean
}

/**
 * Force a value to be treated as text when opened in Excel/Sheets.
 * Wraps the (quote-doubled) value in `="..."`. Google Sheets evaluates this to
 * plain text; Excel keeps it as a text cell regardless of leading digits.
 */
export function excelText(value: string): string {
  return `="${value.replace(/"/g, '""')}"`
}

/** UTF-8 BOM — prepend to CSV bodies so Excel opens them with correct encoding
 * (non-ASCII names, ₹, etc.) instead of interpreting bytes as Windows-1252. */
export const CSV_BOM = '\uFEFF'

/** true when a value would render as an empty cell (null/undefined/NaN/Infinity). */
function isAbsent(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === 'number' && !Number.isFinite(value))
}

/** RFC 4180-escape a single field (already reduced to a string). */
function escapeField(str: string): string {
  if (/[",\r\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`
  return str
}

export function toCSV<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const formatValue = (raw: unknown, col: CsvColumn<T>): string => {
    if (isAbsent(raw)) return ''
    let str = String(raw)
    if (col.asText && str.trim() !== '') {
      str = excelText(str)
    }
    return escapeField(str)
  }

  const headerLine = columns.map((c) => escapeField(c.header)).join(',')
  const lines = rows.map((row) => columns.map((c) => formatValue(row[c.key], c)).join(','))
  return [headerLine, ...lines].join('\r\n')
}

export function csvResponse(csv: string, filename: string): Response {
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}

// ============================================================
// CSV parsing (audit: "Import / Export — no import implementation").
// RFC 4180-aware: handles quoted fields, embedded commas, embedded
// newlines inside quotes, and doubled-quote escaping — the mirror image
// of toCSV()'s escaping above.
// ============================================================

export interface ParsedCSV {
  headers: string[]
  rows: Record<string, string>[]
}

/** Splits raw CSV text into rows of cells, respecting RFC 4180 quoting. */
function splitCSVIntoRows(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    const next = text[i + 1]

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"'
        i++
      } else if (char === '"') {
        inQuotes = false
      } else {
        field += char
      }
    } else if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && next === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += char
    }
  }
  // Final field/row if the file doesn't end with a newline.
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  return rows.filter((r) => !(r.length === 1 && r[0] === ''))
}

/** Parses a CSV file's text into header-keyed row objects. First row is treated as the header. */
export function parseCSV(text: string): ParsedCSV {
  const rows = splitCSVIntoRows(text)
  if (rows.length === 0) return { headers: [], rows: [] }

  const headers = rows[0].map((h) => h.trim())
  const dataRows = rows.slice(1).map((cells) => {
    const obj: Record<string, string> = {}
    headers.forEach((header, i) => {
      obj[header] = (cells[i] ?? '').trim()
    })
    return obj
  })

  return { headers, rows: dataRows }
}
