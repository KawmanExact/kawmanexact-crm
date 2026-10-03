import 'server-only'

import ExcelJS from 'exceljs'

import type { UniversalReportDefinition, ReportTable, ReportColumn } from './types'
import { normalizeReport } from './types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function sanitizeSheetName(name: string): string {
  // Excel sheet names: max 31 chars, no : \ / ? * [ ]
  return name.replace(/[:\\/?*[\]]/g, ' ').slice(0, 31).trim() || 'Sheet'
}

function colLetter(n: number): string {
  let s = ''
  let v = n
  while (v > 0) {
    const r = (v - 1) % 26
    s = String.fromCharCode(65 + r) + s
    v = Math.floor((v - 1) / 26)
  }
  return s
}

const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F1D3A' } }
const HEADER_FONT: Partial<ExcelJS.Font> = {
  color: { argb: 'FFFFFFFF' },
  bold: true,
  size: 9,
  name: 'Calibri',
}
const TITLE_FONT: Partial<ExcelJS.Font> = { bold: true, size: 14, color: { argb: 'FF0F1D3A' }, name: 'Calibri' }
const SUBTITLE_FONT: Partial<ExcelJS.Font> = { size: 9, color: { argb: 'FF64748B' }, name: 'Calibri' }
const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
  bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
  left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
  right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
}

function excelColumnWidth(col: ReportColumn): number {
  if (col.width) return Math.min(48, Math.max(10, col.width))
  if (col.format === 'currency' || col.format === 'number') return 16
  if (col.format === 'date' || col.format === 'datetime') return 18
  return 20
}

function applyNumberFormat(cell: ExcelJS.Cell, format: string | undefined, raw: unknown): void {
  if (format === 'currency') {
    // INR — ExcelJS number format with ₹ symbol (Calibri supports it)
    cell.numFmt = '[$\u20B9-en-IN]#,##0.00'
    const n = typeof raw === 'number' ? raw : Number(String(raw ?? '').replace(/[\u20B9,\s]/g, ''))
    if (Number.isFinite(n)) cell.value = n
  } else if (format === 'number') {
    cell.numFmt = '#,##0.00'
    const n = Number(raw)
    if (Number.isFinite(n)) cell.value = n
  } else if (format === 'percent') {
    cell.numFmt = '0.0%'
    const s = String(raw ?? '').replace('%', '')
    const n = Number(s)
    if (Number.isFinite(n)) cell.value = n / 100
  } else if (format === 'date') {
    cell.numFmt = 'dd/mm/yyyy'
    const d = new Date(String(raw ?? ''))
    if (!isNaN(d.getTime())) cell.value = d
  } else if (format === 'datetime') {
    cell.numFmt = 'dd/mm/yyyy hh:mm'
    const d = new Date(String(raw ?? ''))
    if (!isNaN(d.getTime())) cell.value = d
  }
}

function addReportHeader(ws: ExcelJS.Worksheet, def: UniversalReportDefinition): number {
  let row = 1
  const colCount = Math.max(
    2,
    ...(def.tables?.map((t) => t.columns.length) ?? []),
    ...(def.sections?.flatMap((s) => s.tables?.map((t) => t.columns.length) ?? []) ?? []),
    def.columns?.length ?? 0,
    4,
  )

  ws.getCell(`A${row}`).value = def.title ?? def.name
  ws.getCell(`A${row}`).font = TITLE_FONT
  ws.getCell(`A${row}`).alignment = { vertical: 'middle' }
  ws.mergeCells(`A${row}:${colLetter(colCount)}${row}`)
  row++

  if (def.subtitle || def.periodLabel) {
    ws.getCell(`A${row}`).value = def.subtitle ?? def.periodLabel ?? ''
    ws.getCell(`A${row}`).font = SUBTITLE_FONT
    row++
  }

  const metaParts: string[] = []
  if (def.metadata?.generatedAt) {
    const d = new Date(def.metadata.generatedAt)
    if (!isNaN(d.getTime())) {
      metaParts.push(`Generated: ${d.toLocaleDateString('en-IN')} ${d.toLocaleTimeString('en-IN')}`)
    }
  }
  if (def.metadata?.generatedBy) metaParts.push(`By: ${def.metadata.generatedBy}`)
  if (def.metadata?.organizationName) metaParts.push(def.metadata.organizationName)
  if (def.metadata?.recordCount != null) metaParts.push(`Records: ${def.metadata.recordCount}`)
  if (def.metadata?.dateRange) metaParts.push(def.metadata.dateRange)
  if (def.filters && Object.keys(def.filters).length) {
    metaParts.push(`Filters: ${Object.entries(def.filters).map(([k, v]) => `${k}=${v}`).join(' | ')}`)
  }
  if (def.metadata?.extra && Object.keys(def.metadata.extra).length) {
    metaParts.push(Object.entries(def.metadata.extra).map(([k, v]) => `${k}: ${v}`).join(' | '))
  }

  if (metaParts.length) {
    ws.getCell(`A${row}`).value = metaParts.join('  •  ')
    ws.getCell(`A${row}`).font = { size: 8, color: { argb: 'FF64748B' }, name: 'Calibri' }
    ws.getCell(`A${row}`).alignment = { wrapText: true }
    ws.getRow(row).height = 14
    row++
  }
  // Blank separator row
  row++
  return row
}

function addTableToSheet(
  ws: ExcelJS.Worksheet,
  table: ReportTable,
  startRow: number,
  options?: { showTitle?: boolean },
): number {
  let row = startRow

  if (table.title && options?.showTitle !== false) {
    ws.getCell(`A${row}`).value = table.title
    ws.getCell(`A${row}`).font = { bold: true, size: 10, color: { argb: 'FF0F1D3A' }, name: 'Calibri' }
    row++
    if (table.subtitle) {
      ws.getCell(`A${row}`).value = table.subtitle
      ws.getCell(`A${row}`).font = SUBTITLE_FONT
      row++
    }
  }

  if (!table.columns.length) return row

  if (!table.rows.length) {
    ws.getCell(`A${row}`).value = table.emptyMessage ?? 'No data available for the selected filters.'
    ws.getCell(`A${row}`).font = { italic: true, size: 9, color: { argb: 'FF64748B' }, name: 'Calibri' }
    return row + 2
  }

  const headerRow = ws.getRow(row)
  table.columns.forEach((col, i) => {
    const c = headerRow.getCell(i + 1)
    c.value = col.header
    c.fill = HEADER_FILL
    c.font = HEADER_FONT
    c.alignment = { horizontal: col.align ?? 'left', vertical: 'middle', wrapText: true }
    c.border = THIN_BORDER
  })
  headerRow.height = 16
  headerRow.commit()
  row++

  const dataStartRow = row

  // Large datasets: stream row-by-row, commit each, avoid holding huge intermediate arrays
  for (const r of table.rows) {
    const excelRow = ws.getRow(row)
    table.columns.forEach((col, i) => {
      const raw = r[col.key]
      const cell = excelRow.getCell(i + 1)
      if (col.format && col.format !== 'text') {
        applyNumberFormat(cell, col.format, raw)
        if (cell.value == null) cell.value = raw == null || raw === '' ? '—' : String(raw)
      } else {
        cell.value = raw == null || raw === '' ? '—' : String(raw)
      }
      cell.font = { size: 9, name: 'Calibri', color: { argb: 'FF1E293B' } }
      cell.alignment = { horizontal: col.align ?? 'left', vertical: 'middle', wrapText: true }
      cell.border = THIN_BORDER
    })
    if (row % 2 === 0) {
      excelRow.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }
      })
    }
    excelRow.commit()
    row++
  }

  const dataEndRow = row - 1

  table.columns.forEach((col, i) => {
    ws.getColumn(i + 1).width = excelColumnWidth(col)
  })

  if (table.rows.length > 1) {
    ws.autoFilter = {
      from: { row: dataStartRow - 1, column: 1 },
      to: { row: dataEndRow, column: table.columns.length },
    }
  }
  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: dataStartRow - 1 }]

  ws.getCell(`A${row}`).value = `${table.rows.length} ${table.rows.length === 1 ? 'record' : 'records'}`
  ws.getCell(`A${row}`).font = { size: 8, color: { argb: 'FF94A3B8' }, name: 'Calibri' }
  row += 2

  return row
}

function addMetricsSheet(wb: ExcelJS.Workbook, def: UniversalReportDefinition): void {
  const metrics = def.metrics ?? []
  if (!metrics.length) return

  const ws = wb.addWorksheet(sanitizeSheetName('KPIs'), {
    properties: { tabColor: { argb: 'FF0F1D3A' } },
  })
  let row = addReportHeader(ws, def)

  ws.getCell(`A${row}`).value = 'Key Metrics'
  ws.getCell(`A${row}`).font = { bold: true, size: 11, color: { argb: 'FF0F1D3A' }, name: 'Calibri' }
  row++

  const hRow = ws.getRow(row)
  const headers = ['Metric', 'Value', 'Details', 'Trend']
  headers.forEach((h, i) => {
    const c = hRow.getCell(i + 1)
    c.value = h
    c.fill = HEADER_FILL
    c.font = HEADER_FONT
    c.border = THIN_BORDER
  })
  hRow.commit()
  row++

  for (const m of metrics) {
    const r = ws.getRow(row)
    r.getCell(1).value = m.label
    r.getCell(2).value = m.value
    r.getCell(3).value = m.sublabel ?? ''
    r.getCell(4).value = m.trend ? `${m.trend.value}${m.trend.label ? ` ${m.trend.label}` : ''}` : ''
    r.eachCell((cell) => {
      cell.font = { size: 9, name: 'Calibri' }
      cell.border = THIN_BORDER
      cell.alignment = { vertical: 'middle', wrapText: true }
    })
    r.getCell(2).font = { size: 10, bold: true, name: 'Calibri', color: { argb: 'FF0F1D3A' } }
    if (row % 2 === 0) {
      r.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }
      })
    }
    r.commit()
    row++
  }

  ws.getColumn(1).width = 28
  ws.getColumn(2).width = 18
  ws.getColumn(3).width = 30
  ws.getColumn(4).width = 18
  // Freeze title+header rows
  const freezeAt = (def.subtitle || def.periodLabel ? 4 : 3) + 1
  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: freezeAt }]
}

/**
 * Generate a styled Excel workbook from a UniversalReportDefinition.
 * - Uses exceljs (typed workbook/worksheet/cell APIs)
 * - Styled headers (Kawman navy #0F1D3A), alternating zebra rows, borders
 * - Column widths from ReportColumn.width / format hints
 * - Number formats: INR currency (₹#,##0.00 via en-IN locale), plain numbers, percent, dates
 * - Auto-filter on header row, frozen header row
 * - Print setup (A4, orientation auto by column count, fit-to-width, header/footer with page numbers)
 * - KPIs get a dedicated sheet; each table/section-table gets its own sheet
 * - Large datasets: rows are written incrementally (no giant intermediate string)
 * - All data is pre-scoped by the caller (org + permission filters already applied upstream)
 */
export async function generateReportExcelBuffer(def: UniversalReportDefinition): Promise<Buffer> {
  const report = normalizeReport(def)
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Kawman ExAct'
  wb.created = new Date()
  wb.properties.date1904 = false

  if (report.metrics?.length) addMetricsSheet(wb, report)

  const tables: { table: ReportTable; sheetName: string }[] = []

  for (const t of report.tables ?? []) {
    tables.push({ table: t, sheetName: sanitizeSheetName(t.title ?? report.name) })
  }
  if (report.columns?.length && report.rows?.length && !tables.length) {
    tables.push({
      table: { columns: report.columns, rows: report.rows },
      sheetName: sanitizeSheetName(report.name),
    })
  }
  for (const sec of report.sections ?? []) {
    for (const t of sec.tables ?? []) {
      const raw = `${sec.title} — ${t.title ?? 'Data'}`.slice(0, 31)
      tables.push({ table: t, sheetName: sanitizeSheetName(raw) })
    }
  }

  if (!tables.length) {
    const ws = wb.addWorksheet(sanitizeSheetName(report.name || 'Report'))
    const row = addReportHeader(ws, report)
    ws.getCell(`A${row}`).value = 'No tabular data for this report.'
    ws.getCell(`A${row}`).font = { italic: true, color: { argb: 'FF64748B' }, name: 'Calibri' }
    ws.getColumn(1).width = 50
  } else {
    const used = new Map<string, number>()
    for (const { table, sheetName: raw } of tables) {
      let name = raw
      const count = used.get(raw) ?? 0
      if (count > 0) name = sanitizeSheetName(`${raw} ${count + 1}`)
      used.set(raw, count + 1)

      const ws = wb.addWorksheet(name, {
        properties: { tabColor: { argb: count === 0 ? 'FF0F1D3A' : 'FF7C3AED' } },
      })
      const title = table.title ? `${report.title ?? report.name} — ${table.title}` : (report.title ?? report.name)
      let row = addReportHeader(ws, { ...report, title })
      row = addTableToSheet(ws, table, row)

      ws.pageSetup = {
        paperSize: 9, // A4
        orientation: table.columns.length >= 7 ? 'landscape' : 'portrait',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
        printTitlesRow: '1:1',
      }
      const titleForFooter = (report.title ?? report.name).replace(/&/g, 'and')
      ws.headerFooter.oddFooter = `&L&8&K808080 Kawman ExAct  •  ${titleForFooter}   &C&8&K808080 ${new Date().toLocaleDateString('en-IN')}   &R&8&K808080 Page &P of &N`
    }
  }

  const buffer = await wb.xlsx.writeBuffer()
  return Buffer.from(buffer as ArrayBuffer)
}
