/**
 * Sales Product Tracking export builders — Excel, PDF and CSV.
 *
 * All three take the SAME already-filtered row set that the page rendered, so a
 * number in an export always matches the number on screen. The caller passes the
 * rows from getAllSalesRows(), which parses filters with the one shared parser
 * in lib/sales-filters.ts.
 *
 * Money and quantities are written as NUMBERS with a display format rather than
 * pre-formatted strings, so the recipient can still total the columns in Excel.
 */
import ExcelJS from 'exceljs'
import { jsPDF } from 'jspdf'
import { applyPlugin, autoTable } from 'jspdf-autotable'
import { toCSV, CSV_BOM, type CsvColumn } from '@/lib/csv'
import { PAYMENT_STATUS_LABEL } from '@/lib/sales-schema'
import type { PaymentStatus } from '@/lib/sales-money'
import type { ProductBreakdownRow, SalespersonBreakdownRow, SalesTransactionRow } from '@/types/sales'

/** Hard row caps. Beyond these the file says so rather than silently lying. */
export const EXPORT_ROW_CAPS = { pdf: 5_000, xlsx: 50_000, csv: 50_000 } as const
export type ExportFormat = keyof typeof EXPORT_ROW_CAPS

applyPlugin(jsPDF)

export interface SalesExportMeta {
  organizationName: string
  generatedBy: string
  generatedAt: Date
  /** Human-readable applied-filters list. */
  filterLines: string[]
  /** Set when rows were cut off at the cap, with the true total. */
  truncated?: { shown: number; total: number }
}

const MONEY_FMT = '#,##0.00'
const QTY_FMT = '#,##0.###'
const DATE_FMT = 'dd-mmm-yyyy'

/** Keys of SalesTransactionRow that a column can render. */
type ColumnKey =
  | 'saleDate'
  | 'salespersonName'
  | 'customerName'
  | 'productName'
  | 'invoiceNumber'
  | 'quantity'
  | 'unit'
  | 'unitPrice'
  | 'totalAmount'
  | 'amountPaid'
  | 'balanceAmount'
  | 'paymentStatus'
  | 'paymentDate'
  | 'lineNumber'
  | 'remarks'

interface SalesExportColumn {
  header: string
  key: ColumnKey
  width: number
  format?: string
  align?: 'left' | 'right'
}

/** Every table column, in the order they appear in all three formats. */
export const SALES_EXPORT_COLUMNS: readonly SalesExportColumn[] = [
  { header: 'Date', key: 'saleDate', width: 13 },
  { header: 'Salesperson', key: 'salespersonName', width: 20 },
  { header: 'Customer', key: 'customerName', width: 28 },
  { header: 'Product', key: 'productName', width: 30 },
  { header: 'Invoice Number', key: 'invoiceNumber', width: 18 },
  { header: 'Quantity', key: 'quantity', width: 12, format: QTY_FMT, align: 'right' },
  { header: 'Unit', key: 'unit', width: 8 },
  { header: 'Unit Price', key: 'unitPrice', width: 14, format: MONEY_FMT, align: 'right' },
  { header: 'Total Amount', key: 'totalAmount', width: 15, format: MONEY_FMT, align: 'right' },
  { header: 'Amount Paid', key: 'amountPaid', width: 15, format: MONEY_FMT, align: 'right' },
  { header: 'Balance', key: 'balanceAmount', width: 14, format: MONEY_FMT, align: 'right' },
  { header: 'Payment Status', key: 'paymentStatus', width: 16 },
  { header: 'Payment Date', key: 'paymentDate', width: 14 },
  { header: 'Invoice Line', key: 'lineNumber', width: 9, align: 'right' },
  { header: 'Remarks', key: 'remarks', width: 30 },
]

function cellValue(row: SalesTransactionRow, key: ColumnKey): string | number | null {
  const value = row[key]
  if (value === null || value === undefined) return null
  if (key === 'saleDate') return row.saleDate.slice(0, 10)
  if (key === 'paymentDate') return row.paymentDate ? row.paymentDate.slice(0, 10) : null
  if (key === 'paymentStatus') return PAYMENT_STATUS_LABEL[row.paymentStatus]
  return value as string | number
}

const PAYMENT_FILL: Record<PaymentStatus, string> = {
  PAID: 'FFD6F5E6',
  PARTIALLY_PAID: 'FFFDE9C8',
  PENDING: 'FFFAD3D3',
}

function exportDate(date: Date): string {
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ============================================================
// Excel (exceljs)
// ============================================================

/**
 * Workbook with a styled header block, the applied filters, a summary block,
 * the full detail table (freeze panes, autofilter, SUM totals row, landscape
 * print setup with a repeated header) and two extra sheets.
 */
export async function buildSalesWorkbook(input: {
  rows: SalesTransactionRow[]
  products: ProductBreakdownRow[]
  salespeople: SalespersonBreakdownRow[]
  kpis: {
    totalSales: number
    transactionCount: number
    quantityByUnit: Array<{ unit: string; quantity: number }>
    totalSalesValue: number
    totalAmountPaid: number
    totalPendingAmount: number
  }
  meta: SalesExportMeta
}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = input.meta.organizationName || 'Kawman ExAct'
  wb.created = input.meta.generatedAt

  const headerFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F1D3A' } }
  const headerFont: Partial<ExcelJS.Font> = { color: { argb: 'FFFFFFFF' }, bold: true, size: 9 }
  const titleFont: Partial<ExcelJS.Font> = { bold: true, size: 14, color: { argb: 'FF0F1D3A' } }
  const labelFont: Partial<ExcelJS.Font> = { bold: true, size: 9, color: { argb: 'FF64748B' } }
  const thinBorder: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
  }

  // ---- Detail sheet ----
  const ws = wb.addWorksheet('Sales Transactions')
  ws.columns = SALES_EXPORT_COLUMNS.map((col) => ({
    header: col.header,
    key: col.key as string,
    width: Math.min(50, Math.max(10, col.width)),
  }))

  let row = 1
  ws.mergeCells(row, 1, row, SALES_EXPORT_COLUMNS.length)
  const titleCell = ws.getCell(row, 1)
  titleCell.value = 'Sales Product Tracking Report'
  titleCell.font = titleFont
  row += 1

  ws.mergeCells(row, 1, row, SALES_EXPORT_COLUMNS.length)
  ws.getCell(row, 1).value = input.meta.organizationName
  ws.getCell(row, 1).font = labelFont
  row += 1

  ws.mergeCells(row, 1, row, SALES_EXPORT_COLUMNS.length)
  ws.getCell(row, 1).value = `Report date: ${exportDate(input.meta.generatedAt)}`
  ws.getCell(row, 1).font = labelFont
  row += 1

  ws.mergeCells(row, 1, row, SALES_EXPORT_COLUMNS.length)
  ws.getCell(row, 1).value = `Generated by: ${input.meta.generatedBy}`
  ws.getCell(row, 1).font = labelFont
  row += 1

  row += 1
  ws.getCell(row, 1).value = 'Applied filters'
  ws.getCell(row, 1).font = { bold: true, size: 10 }
  row += 1
  if (input.meta.filterLines.length === 0) {
    ws.getCell(row, 1).value = 'None (all records)'
    row += 1
  } else {
    for (const line of input.meta.filterLines) {
      ws.getCell(row, 1).value = line
      row += 1
    }
  }

  row += 1
  ws.getCell(row, 1).value = 'Summary'
  ws.getCell(row, 1).font = { bold: true, size: 10 }
  row += 1
  // Money rows carry a display format; counts and the per-unit quantity text
  // stay plain so Excel does not try to total a comma-joined string.
  const summaryPairs: Array<{ label: string; value: string | number; money: boolean }> = [
    { label: 'Total Sales (distinct invoices)', value: input.kpis.totalSales, money: false },
    { label: 'Number of Transactions', value: input.kpis.transactionCount, money: false },
    {
      label: 'Total Quantity Sold',
      value: input.kpis.quantityByUnit.map((q) => `${q.quantity} ${q.unit}`).join(', ') || '0',
      money: false,
    },
    { label: 'Total Sales Value', value: input.kpis.totalSalesValue, money: true },
    { label: 'Total Amount Paid', value: input.kpis.totalAmountPaid, money: true },
    { label: 'Total Pending Amount', value: input.kpis.totalPendingAmount, money: true },
  ]
  for (const pair of summaryPairs) {
    ws.getCell(row, 1).value = pair.label
    ws.getCell(row, 1).font = labelFont
    const valueCell = ws.getCell(row, 2)
    valueCell.value = pair.value
    if (pair.money) valueCell.numFmt = MONEY_FMT
    row += 1
  }
  if (input.meta.truncated) {
    ws.mergeCells(row, 1, row, SALES_EXPORT_COLUMNS.length)
    ws.getCell(row, 1).value = `TRUNCATED: showing the first ${input.meta.truncated.shown} of ${input.meta.truncated.total} matching rows.`
    ws.getCell(row, 1).font = { bold: true, color: { argb: 'FFB45309' } }
    row += 1
  }

  row += 1
  const headerRowNumber = row
  const excelHeader = ws.getRow(headerRowNumber)
  for (const col of SALES_EXPORT_COLUMNS) {
    const cell = excelHeader.getCell(col.key as string)
    cell.fill = headerFill
    cell.font = headerFont
    cell.alignment = { vertical: 'middle', horizontal: col.align ?? 'left', wrapText: true }
    cell.border = thinBorder
  }
  excelHeader.height = 22

  const dataStartRow = headerRowNumber + 1
  let dataRowNumber = dataStartRow

  for (const record of input.rows) {
    dataRowNumber += 1
    const excelRow = ws.getRow(dataRowNumber)
    const excelRowNumber = excelRow.number
    for (const col of SALES_EXPORT_COLUMNS) {
      const cell = excelRow.getCell(col.key as string)
      cell.value = cellValue(record, col.key) as string | number | null
      cell.border = thinBorder
      cell.alignment = { horizontal: col.align ?? 'left' }
      if (col.format) cell.numFmt = col.format
    }
    // Dates are stored as real Date objects so Excel can sort/filter them.
    ws.getCell(excelRowNumber, 1).value = new Date(record.saleDate)
    ws.getCell(excelRowNumber, 1).numFmt = DATE_FMT
    ws.getCell(excelRowNumber, 1).alignment = { horizontal: 'left' }
    if (record.paymentDate) {
      ws.getCell(excelRowNumber, 13).value = new Date(record.paymentDate)
      ws.getCell(excelRowNumber, 13).numFmt = DATE_FMT
    }

    const statusCell = excelRow.getCell('paymentStatus')
    statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PAYMENT_FILL[record.paymentStatus] } }

    if ((dataRowNumber - dataStartRow) % 2 === 0) {
      for (const col of SALES_EXPORT_COLUMNS) {
        if (col.key === 'paymentStatus') continue
        const cell = excelRow.getCell(col.key as string)
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }
      }
    }
  }

  if (dataRowNumber >= dataStartRow) {
    // Totals row using real SUM formulas so the recipient can re-check.
    // Unit price is deliberately NOT summed: a total of prices means nothing.
    const totalsRow = ws.getRow(dataRowNumber + 1)
    totalsRow.getCell('productName').value = 'TOTAL'
    totalsRow.getCell('productName').font = { bold: true }
    const sums: Array<[ColumnKey, string]> = [
      ['quantity', 'F'],
      ['totalAmount', 'I'],
      ['amountPaid', 'J'],
      ['balanceAmount', 'K'],
    ]
    for (const [key, colLetter] of sums) {
      const colIndex = SALES_EXPORT_COLUMNS.findIndex((c) => c.key === key) + 1
      const cell = totalsRow.getCell(colIndex)
      cell.value = { formula: `SUM(${colLetter}${dataStartRow}:${colLetter}${dataRowNumber})` }
      cell.font = { bold: true }
      cell.numFmt = key === 'quantity' ? QTY_FMT : MONEY_FMT
      cell.alignment = { horizontal: 'right' }
    }
    const rowCountCell = totalsRow.getCell(2)
    rowCountCell.value = { formula: `COUNTA(C${dataStartRow}:C${dataRowNumber})&" rows"` }
    rowCountCell.font = { bold: true }

    ws.autoFilter = {
      from: { row: headerRowNumber, column: 1 },
      to: { row: dataRowNumber, column: SALES_EXPORT_COLUMNS.length },
    }
    ws.views = [{ state: 'frozen', xSplit: 0, ySplit: headerRowNumber }]
    ws.pageSetup = {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.3, right: 0.3, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
      printTitlesRow: `${headerRowNumber}:${headerRowNumber}`,
    }
    ws.headerFooter.oddFooter = `&L&8&K808080 ${input.meta.organizationName}  •  Sales Product Tracking   &C&8&K808080 ${exportDate(input.meta.generatedAt)}   &R&8&K808080 Page &P of &N`
  }

  // ---- Product-wise sheet ----
  const productWs = wb.addWorksheet('Product-wise')
  productWs.columns = [
    { header: 'Product', key: 'productName', width: 32 },
    { header: 'Type', key: 'kind', width: 10 },
    { header: 'Unit', key: 'unit', width: 8 },
    { header: 'Quantity', key: 'quantity', width: 14, style: { numFmt: QTY_FMT } },
    { header: 'Sales Value', key: 'totalValue', width: 16, style: { numFmt: MONEY_FMT } },
    { header: 'Amount Paid', key: 'amountPaid', width: 16, style: { numFmt: MONEY_FMT } },
    { header: 'Pending', key: 'pendingAmount', width: 16, style: { numFmt: MONEY_FMT } },
    { header: 'Transactions', key: 'transactionCount', width: 14 },
    { header: '% of Sales', key: 'share', width: 12 },
  ]
  const productHeaderRow = prepareExtraSheet(productWs, 'Product-wise Summary', input.meta, headerFill, headerFont, thinBorder)
  for (const product of input.products) {
    const added = productWs.addRow({
      productName: product.productName,
      kind: product.isOther ? 'Other' : 'Catalog',
      unit: product.unit,
      quantity: product.quantity,
      totalValue: product.totalValue,
      amountPaid: product.amountPaid,
      pendingAmount: product.pendingAmount,
      transactionCount: product.transactionCount,
      share: product.share / 100,
    })
    added.getCell('share').numFmt = '0.00%'
    added.eachCell((cell) => {
      cell.border = thinBorder
    })
  }
  productWs.views = [{ state: 'frozen', ySplit: productHeaderRow }]
  productWs.autoFilter = { from: { row: productHeaderRow, column: 1 }, to: { row: productWs.rowCount, column: productWs.columnCount } }
  productWs.pageSetup = {
    paperSize: 9,
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    printTitlesRow: `${productHeaderRow}:${productHeaderRow}`,
  }

  // ---- Salesperson x Product sheet ----
  const matrixWs = wb.addWorksheet('Salesperson x Product')
  matrixWs.columns = [
    { header: 'Salesperson', key: 'salespersonName', width: 22 },
    { header: 'Product', key: 'productName', width: 32 },
    { header: 'Unit', key: 'unit', width: 8 },
    { header: 'Quantity', key: 'quantity', width: 14, style: { numFmt: QTY_FMT } },
    { header: 'Sales Value', key: 'totalValue', width: 16, style: { numFmt: MONEY_FMT } },
    { header: 'Amount Paid', key: 'amountPaid', width: 16, style: { numFmt: MONEY_FMT } },
    { header: 'Pending', key: 'pendingAmount', width: 16, style: { numFmt: MONEY_FMT } },
    { header: '% of Salesperson', key: 'share', width: 18 },
  ]
  const matrixHeaderRow = prepareExtraSheet(matrixWs, 'Salesperson x Product', input.meta, headerFill, headerFont, thinBorder)
  for (const seller of input.salespeople) {
    for (const product of seller.products) {
      const added = matrixWs.addRow({
        salespersonName: seller.salespersonName,
        productName: product.productName,
        unit: product.unit,
        quantity: product.quantity,
        totalValue: product.totalValue,
        amountPaid: product.amountPaid,
        pendingAmount: product.pendingAmount,
        share: product.share / 100,
      })
      added.getCell('share').numFmt = '0.00%'
      added.eachCell((cell) => {
        cell.border = thinBorder
      })
    }
  }
  matrixWs.views = [{ state: 'frozen', ySplit: matrixHeaderRow }]
  matrixWs.autoFilter = { from: { row: matrixHeaderRow, column: 1 }, to: { row: matrixWs.rowCount, column: matrixWs.columnCount } }
  matrixWs.pageSetup = {
    paperSize: 9,
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    printTitlesRow: `${matrixHeaderRow}:${matrixHeaderRow}`,
  }

  const buffer = await wb.xlsx.writeBuffer()
  return Buffer.from(buffer)
}

/**
 * Insert a title / report-date / filters block above the auto-created header
 * row of an extra sheet, restyle that header, and return its new row number.
 */
function prepareExtraSheet(
  sheet: ExcelJS.Worksheet,
  title: string,
  meta: SalesExportMeta,
  headerFill: ExcelJS.Fill,
  headerFont: Partial<ExcelJS.Font>,
  thinBorder: Partial<ExcelJS.Borders>,
): number {
  // Rows 1 = title, 2 = report date, 3 = filters; the column header moves to 4.
  sheet.insertRows(1, [[], [], []])
  sheet.getCell(1, 1).value = title
  sheet.getCell(2, 1).value = `Report date: ${exportDate(meta.generatedAt)}`
  sheet.getCell(3, 1).value = meta.filterLines.join('  |  ') || 'No filters applied'

  sheet.getCell(1, 1).font = { bold: true, size: 13, color: { argb: 'FF0F1D3A' } }
  sheet.getCell(2, 1).font = { size: 9, color: { argb: 'FF64748B' } }
  sheet.getCell(3, 1).font = { size: 9, color: { argb: 'FF64748B' } }

  const headerRowNumber = 4
  const headerRow = sheet.getRow(headerRowNumber)
  for (let i = 1; i <= sheet.columnCount; i += 1) {
    const cell = headerRow.getCell(i)
    cell.fill = headerFill
    cell.font = headerFont
    cell.alignment = { vertical: 'middle', wrapText: true }
    cell.border = thinBorder
  }
  headerRow.height = 20
  return headerRowNumber
}

// ============================================================
// PDF (jspdf + jspdf-autotable)
// ============================================================

/** Landscape A4 report: title block, filters, KPI summary, then the table. */
export function buildSalesPdf(input: {
  rows: SalesTransactionRow[]
  kpis: {
    totalSales: number
    transactionCount: number
    quantityByUnit: Array<{ unit: string; quantity: number }>
    totalSalesValue: number
    totalAmountPaid: number
    totalPendingAmount: number
  }
  meta: SalesExportMeta
}): Buffer {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 28

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text('Sales Product Tracking Report', margin, margin + 8)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(input.meta.organizationName, margin, margin + 24)
  doc.text(
    `Report period: ${input.meta.filterLines.find((l) => l.startsWith('Date Range'))?.replace('Date Range: ', '') ?? 'All time'}`,
    margin,
    margin + 38
  )
  doc.text(
    `Generated: ${exportDate(input.meta.generatedAt)} by ${input.meta.generatedBy}`,
    pageWidth - margin,
    margin + 38,
    { align: 'right' }
  )

  let cursor = margin + 56
  if (input.meta.filterLines.length > 0) {
    doc.setFontSize(8)
    doc.text(`Filters: ${input.meta.filterLines.join('  |  ')}`, margin, cursor, { maxWidth: pageWidth - margin * 2 })
    cursor += 16
  }
  if (input.meta.truncated) {
    doc.setFontSize(8)
    doc.setTextColor(180)
    doc.text(
      `TRUNCATED: showing the first ${input.meta.truncated.shown} of ${input.meta.truncated.total} matching rows.`,
      margin,
      cursor
    )
    doc.setTextColor(0)
    cursor += 16
  }

  // KPI summary block.
  const quantityText =
    input.kpis.quantityByUnit.map((q) => `${q.quantity} ${q.unit}`).join(', ') || '0'
  const kpiLines: Array<[string, string]> = [
    ['Total Sales', String(input.kpis.totalSales)],
    ['Total Quantity', quantityText],
    ['Total Sales Value', input.kpis.totalSalesValue.toFixed(2)],
    ['Total Paid', input.kpis.totalAmountPaid.toFixed(2)],
    ['Total Pending', input.kpis.totalPendingAmount.toFixed(2)],
  ]
  doc.setFontSize(9)
  const kpiTop = cursor + 6
  let kpiX = margin
  for (const [label, value] of kpiLines) {
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(110)
    doc.text(label, kpiX, kpiTop)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(0)
    doc.text(value, kpiX, kpiTop + 13)
    kpiX += 150
  }
  doc.setTextColor(0)
  cursor = kpiTop + 34

  const head = [
    ['Date', 'Salesperson', 'Customer', 'Product', 'Invoice', 'Qty', 'Unit', 'Unit Price', 'Total', 'Paid', 'Balance', 'Status'],
  ]
  const body = input.rows.map((row) => [
    row.saleDate.slice(0, 10),
    row.salespersonName,
    row.customerName,
    row.productName,
    row.invoiceNumber,
    String(row.quantity),
    row.unit,
    row.unitPrice.toFixed(2),
    row.totalAmount.toFixed(2),
    row.amountPaid.toFixed(2),
    row.balanceAmount.toFixed(2),
    PAYMENT_STATUS_LABEL[row.paymentStatus],
  ])

  autoTable(doc, {
    startY: cursor,
    head,
    body,
    margin: { left: margin, right: margin, top: margin, bottom: 40 },
    styles: { fontSize: 7, cellPadding: 3, overflow: 'linebreak', cellWidth: 'wrap', valign: 'middle' },
    headStyles: { fillColor: [15, 29, 58], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 52, halign: 'left' },
      1: { cellWidth: 62 },
      2: { cellWidth: 92 },
      3: { cellWidth: 104 },
      4: { cellWidth: 58 },
      5: { cellWidth: 40, halign: 'right' },
      6: { cellWidth: 26, halign: 'left' },
      7: { cellWidth: 50, halign: 'right' },
      8: { cellWidth: 54, halign: 'right' },
      9: { cellWidth: 50, halign: 'right' },
      10: { cellWidth: 50, halign: 'right' },
      11: { cellWidth: 54, halign: 'left' },
    },
    // The header repeats because autotable re-draws `head` on every page.
    didDrawPage: (hook) => {
      const pageCount = doc.getNumberOfPages()
      doc.setFontSize(7)
      doc.setTextColor(148)
      doc.text(
        `${input.meta.organizationName} • Sales Product Tracking • ${exportDate(input.meta.generatedAt)}`,
        margin,
        doc.internal.pageSize.getHeight() - 18
      )
      doc.text(
        `Page ${hook.pageNumber} of ${pageCount}`,
        pageWidth - margin,
        doc.internal.pageSize.getHeight() - 18,
        { align: 'right' }
      )
      doc.setTextColor(0)
    },
  })

  return Buffer.from(doc.output('arraybuffer'))
}

// ============================================================
// CSV (src/lib/csv.ts, with spreadsheet formula-injection protection)
// ============================================================

/**
 * Spreadsheet apps evaluate a cell that starts with = + - @ as a formula, so a
 * remark like "=1+1" or a customer typed as "-cmd" would execute on open. A
 * leading apostrophe forces the cell to text; Excel and Sheets both hide it.
 */
export function escapeFormulaInjection(value: string): string {
  if (value.length === 0) return value
  const first = value[0]
  if (first === '=' || first === '+' || first === '-' || first === '@') return `'${value}`
  // Spreadsheet apps strip leading whitespace and control characters before
  // evaluating a cell, so a tab- or space-prefixed "=..." is dangerous too.
  const afterLeadingSpace = value.replace(/^[\s\uFEFF]+/, '')
  if (afterLeadingSpace.length > 0 && '=+-@'.includes(afterLeadingSpace[0])) return `'${value}`
  return value
}

interface SalesCsvRow {
  [column: string]: string | number
}

/**
 * Flat CSV of the detail table, reusing toCSV for RFC 4180 quoting. Cell values
 * are passed through escapeFormulaInjection first.
 */
export function buildSalesCsv(rows: SalesTransactionRow[]): string {
  const csvRows: SalesCsvRow[] = rows.map((row) => {
    const out: SalesCsvRow = {}
    for (const col of SALES_EXPORT_COLUMNS) {
      const value = cellValue(row, col.key)
      out[col.key] = value === null ? '' : escapeFormulaInjection(String(value))
    }
    return out
  })

  const columns: CsvColumn<SalesCsvRow>[] = SALES_EXPORT_COLUMNS.map((col) => ({
    key: col.key as string,
    header: col.header,
  }))

  return CSV_BOM + toCSV(csvRows, columns)
}

export function salesExportFilename(format: ExportFormat, orgName: string): string {
  const slug = orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'organisation'
  return `${slug}-sales-product-tracking.${format}`
}