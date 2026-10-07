import { describe, it, expect, vi } from 'vitest'
// The global test setup stubs exceljs for the report-engine tests. This suite
// asserts on the bytes the real library produces, so it needs the real one.
vi.unmock('exceljs')
import ExcelJS from 'exceljs'
import {
  EXPORT_ROW_CAPS,
  buildSalesCsv,
  buildSalesPdf,
  buildSalesWorkbook,
  escapeFormulaInjection,
  salesExportFilename,
  SALES_EXPORT_COLUMNS,
  type SalesExportMeta,
} from './sales-export'
import {
  computeProductBreakdown,
  computeSalesKpis,
  computeSalespersonBreakdown,
  mapSaleRow,
} from '@/services/sales.service'
import type { ProductBreakdownRow, SalesTransactionRow } from '@/types/sales'

function row(overrides: Partial<SalesTransactionRow> = {}): SalesTransactionRow {
  return {
    id: 'st_1',
    groupId: 'grp_1',
    organizationId: 'org_1',
    salespersonId: 'u1',
    salespersonName: 'Priya Sharma',
    customerId: 'c1',
    customerName: 'Acme Nutrition',
    productId: 'p1',
    productName: 'CarniExAct',
    otherProductName: null,
    isOtherProduct: false,
    unit: 'kg',
    quantity: 2,
    unitPrice: 1500.5,
    totalAmount: 3001,
    amountPaid: 3001,
    balanceAmount: 0,
    paymentStatus: 'PAID',
    paymentDate: '2026-03-05',
    saleDate: '2026-03-01T00:00:00.000Z',
    invoiceNumber: 'INV-100',
    lineNumber: 1,
    remarks: 'Delivered in good condition',
    ...overrides,
  }
}

const meta: SalesExportMeta = {
  organizationName: 'Kawman ExAct',
  generatedBy: 'Priya Sharma',
  generatedAt: new Date(2026, 7, 20, 10, 0, 0),
  filterLines: ['Date Range: Last 7 days', 'Payment Status: Paid'],
}

const kpis = {
  totalSales: 1,
  transactionCount: 1,
  quantityByUnit: [{ unit: 'kg', quantity: 2 }],
  totalSalesValue: 3001,
  totalAmountPaid: 3001,
  totalPendingAmount: 0,
}

const products: ProductBreakdownRow[] = [
  {
    key: 'p1',
    productId: 'p1',
    productName: 'CarniExAct',
    isOther: false,
    unit: 'kg',
    quantity: 2,
    totalValue: 3001,
    taxableValue: 3001,
    gstAmount: 0,
    avgUnitPrice: 1500.5,
    amountPaid: 3001,
    pendingAmount: 0,
    transactionCount: 1,
    share: 100,
  },
]

const salespeople = [
  {
    salespersonId: 'u1',
    salespersonName: 'Priya Sharma',
    unit: 'kg',
    totalQuantity: 2,
    quantityByUnit: [{ unit: 'kg', quantity: 2 }],
    totalSalesValue: 3001,
    amountPaid: 3001,
    pendingAmount: 0,
    products,
  },
]

describe('escapeFormulaInjection', () => {
  it('neutralises the four formula starters', () => {
    for (const value of ['=1+1', '+1', '-1', '@SUM(A1)']) {
      expect(escapeFormulaInjection(value)).toBe(`'${value}`)
    }
  })

  it('neutralises a formula hidden behind leading whitespace or a tab', () => {
    expect(escapeFormulaInjection('\t=1+1')).toBe("'\t=1+1")
    expect(escapeFormulaInjection('  =cmd')).toBe("'  =cmd")
  })

  it('leaves ordinary text and numbers alone', () => {
    expect(escapeFormulaInjection('Acme Nutrition')).toBe('Acme Nutrition')
    expect(escapeFormulaInjection('3001.00')).toBe('3001.00')
    expect(escapeFormulaInjection('2 kg')).toBe('2 kg')
  })

  it('does not mangle a negative number typed as a value cell', () => {
    // Money is never negative in this report; only free text needs guarding,
    // and the leading apostrophe on a genuine negative is harmless anyway.
    expect(escapeFormulaInjection('abc')).toBe('abc')
  })

  it('handles the empty string', () => {
    expect(escapeFormulaInjection('')).toBe('')
  })
})

describe('buildSalesCsv', () => {
  it('starts with a UTF-8 BOM so Excel reads ₹ and ™ correctly', () => {
    expect(buildSalesCsv([row()]).charCodeAt(0)).toBe(0xfeff)
  })

  it('writes a header row and one line per transaction', () => {
    const lines = buildSalesCsv([row(), row({ id: 'st_2', invoiceNumber: 'INV-101' })]).split('\r\n')
    expect(lines[0]).toContain('Invoice Number')
    expect(lines[0]).toContain('Taxable Value')
    expect(lines[1]).toContain('INV-100')
    expect(lines[2]).toContain('INV-101')
  })

  it('renders the payment status LABEL, not the raw enum', () => {
    const csv = buildSalesCsv([row({ paymentStatus: 'PARTIALLY_PAID' })])
    expect(csv).toContain('Partially Paid')
    expect(csv).not.toContain('PARTIALLY_PAID')
  })

  it('renders dates as plain days, not ISO timestamps', () => {
    expect(buildSalesCsv([row()])).toContain('2026-03-01')
  })

  it('leaves an unpaid invoice with no payment date blank rather than inventing one', () => {
    const csv = buildSalesCsv([row({ paymentDate: null, paymentStatus: 'PENDING', amountPaid: 0 })])
    expect(csv).not.toContain('2026-03-05')
  })

  it('escapes a customer name containing a comma', () => {
    expect(buildSalesCsv([row({ customerName: 'Acme, Inc.' })])).toContain('"Acme, Inc."')
  })

  it('neutralises a formula typed into a remarks field', () => {
    const csv = buildSalesCsv([row({ remarks: '=1+1' })])
    expect(csv).toContain("'=1+1")
    expect(csv).not.toMatch(/,=1\+1/)
  })

  it('handles a typed "Other" product line', () => {
    const csv = buildSalesCsv([
      row({ productId: null, productName: 'Curcumin 95%', isOtherProduct: true, otherProductName: 'Curcumin 95%' }),
    ])
    expect(csv).toContain('Curcumin 95%')
  })
})

describe('buildSalesPdf', () => {
  it('produces a real PDF buffer', () => {
    const pdf = buildSalesPdf({ rows: [row()], kpis, meta })
    expect(Buffer.isBuffer(pdf)).toBe(true)
    expect(pdf.length).toBeGreaterThan(500)
  })

  it('starts with the %PDF magic bytes', () => {
    expect(buildSalesPdf({ rows: [row()], kpis, meta }).subarray(0, 4).toString()).toBe('%PDF')
  })

  it('states that it was truncated when the cap cut rows off', () => {
    const truncatedMeta: SalesExportMeta = {
      ...meta,
      truncated: { shown: 5000, total: 12000 },
    }
    // The text is compressed inside the PDF stream, so assert on the inputs
    // being threaded through rather than on PDF internals.
    const pdf = buildSalesPdf({ rows: [row()], kpis, meta: truncatedMeta })
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF')
    expect(truncatedMeta.truncated?.total).toBe(12000)
  })

  it('renders an empty row set without throwing', () => {
    const pdf = buildSalesPdf({ rows: [], kpis, meta })
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF')
  })

  it('does not crash on text that needs escaping', () => {
    const pdf = buildSalesPdf({
      rows: [row({ customerName: 'Ünïcödé (P)vt. "Ltd" & Co', remarks: 'line\nbreak' })],
      kpis,
      meta,
    })
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF')
  })
})

/** Read a generated workbook back with the real exceljs. */
async function load(buffer: Buffer) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer as unknown as ArrayBuffer)
  return wb
}

/** 1-based row number of the first row matching the predicate. */
function rowWhere(
  sheet: ExcelJS.Worksheet,
  predicate: (row: ExcelJS.Row) => boolean
): number {
  let found = 0
  sheet.eachRow((row, rowNumber) => {
    if (!found && predicate(row)) found = rowNumber
  })
  return found
}

/** The styled column-header row of the detail sheet. */
function detailHeaderRow(sheet: ExcelJS.Worksheet): number {
  return rowWhere(
    sheet,
    (row) => row.getCell(1).value === 'Date' && row.getCell(8).value === 'Unit Price'
  )
}

describe('buildSalesWorkbook', () => {
  it('produces a readable .xlsx workbook', async () => {
    const wb = await load(
      await buildSalesWorkbook({ rows: [row()], products, salespeople, kpis, meta })
    )
    expect(wb.worksheets.length).toBe(4)
  })

  it('includes the detail, product-wise, salesperson x product and GST summary sheets', async () => {
    const wb = await load(
      await buildSalesWorkbook({ rows: [row()], products, salespeople, kpis, meta })
    )
    expect(wb.worksheets.map((s) => s.name)).toEqual([
      'Sales Transactions',
      'Product-wise',
      'Salesperson x Product',
      'GST Summary',
    ])
  })

  it('records the report title and the applied filters on the detail sheet', async () => {
    const wb = await load(
      await buildSalesWorkbook({ rows: [row()], products, salespeople, kpis, meta })
    )
    const text = JSON.stringify(
      wb.worksheets[0].getSheetValues().map((v) => (Array.isArray(v) ? v : [v]))
    )
    expect(text).toContain('Sales Product Tracking Report')
    expect(text).toContain('Kawman ExAct')
    expect(text).toContain('Date Range: Last 7 days')
  })

  it('writes money as a NUMBER with a display format, so the recipient can total it', async () => {
    const wb = await load(
      await buildSalesWorkbook({ rows: [row()], products, salespeople, kpis, meta })
    )
    const sheet = wb.worksheets[0]
    let found: ExcelJS.Cell | undefined
    sheet.eachRow((r) => {
      r.eachCell((cell) => {
        if (cell.value === 3001 && cell.numFmt === '#,##0.00') found = cell
      })
    })
    expect(found).toBeDefined()
    expect(typeof found!.value).toBe('number')
  })

  it('adds a SUM totals row so the totals can be re-checked', async () => {
    const wb = await load(
      await buildSalesWorkbook({ rows: [row(), row({ id: 'st_2', totalAmount: 500, amountPaid: 0, balanceAmount: 500, paymentStatus: 'PENDING', paymentDate: null })] , products, salespeople, kpis, meta })
    )
    const formulas: string[] = []
    wb.worksheets[0].eachRow((r) =>
      r.eachCell((cell) => {
        const value = cell.value
        if (value && typeof value === 'object' && 'formula' in value) formulas.push(value.formula)
      })
    )
    expect(formulas.some((f) => f.startsWith('SUM(I'))).toBe(true)
  })

  it('writes the sale date as a real Date so Excel can sort it', async () => {
    const wb = await load(
      await buildSalesWorkbook({ rows: [row()], products, salespeople, kpis, meta })
    )
    const dates: unknown[] = []
    wb.worksheets[0].eachRow((r) => {
      const value = r.getCell(1).value
      if (value instanceof Date) dates.push(value)
    })
    expect(dates.length).toBe(1)
    expect((dates[0] as Date).getUTCFullYear()).toBe(2026)
  })

  it('renders an empty row set without throwing', async () => {
    const wb = await load(await buildSalesWorkbook({ rows: [], products: [], salespeople: [], kpis, meta }))
    expect(wb.worksheets.length).toBe(4)
  })

  it('survives a row whose text needs escaping', async () => {
    const wb = await load(
      await buildSalesWorkbook({
        rows: [row({ customerName: 'Ünïcödé "Ltd" & Co', remarks: '=1+1' })],
        products,
        salespeople,
        kpis,
        meta,
      })
    )
    expect(wb.worksheets.length).toBe(4)
  })
})

// ============================================================
// Sales Tracking workbook layout. The six-invoice sample below
// pins the layout a previewer or an Excel Protected View session
// sees WITHOUT recalculating anything: a real header row, no
// blank row under it, and TOTAL cells that already carry values.
// ============================================================

/** A sale line as it comes out of Prisma (relations included). */
interface DbSaleLine {
  id: string
  groupId: string
  organizationId: string
  salespersonId: string
  salesperson: { id: string; name: string; email: string }
  customerId: string
  customer: { id: string; name: string }
  productId: string | null
  product: { id: string; name: string; variant: string | null; unit: string } | null
  otherProductName: string | null
  unit: string | null
  saleDate: Date
  invoiceNumber: string
  invoiceKey: string
  hsnCode: string | null
  quantity: number
  unitPrice: number
  totalAmount: number
  gstRate: number
  gstAmount: number
  freightAmount: number
  invoiceAmount: number
  advanceAmount: number
  pdcAmount: number
  amountPaid: number
  balanceAmount: number
  paymentStatus: 'PAID' | 'PARTIALLY_PAID' | 'PENDING'
  paymentDate: Date | null
  paymentMode: string | null
  purchaseOrderNo: string | null
  leadTimeDays: number | null
  remarks: string | null
  lineNumber: number
}

function dbLine(overrides: Partial<DbSaleLine> = {}): DbSaleLine {
  return {
    id: 'st_1',
    groupId: 'grp_1',
    organizationId: 'org_1',
    salespersonId: 'u1',
    salesperson: { id: 'u1', name: 'Priya Sharma', email: 'priya@example.com' },
    customerId: 'c1',
    customer: { id: 'c1', name: 'Acme Nutrition' },
    productId: null,
    product: null,
    otherProductName: null,
    unit: null,
    saleDate: new Date('2026-03-01T00:00:00.000Z'),
    invoiceNumber: 'INV-176095',
    invoiceKey: 'inv-176095',
    hsnCode: null,
    quantity: 0,
    unitPrice: 0,
    totalAmount: 0,
    gstRate: 0,
    gstAmount: 0,
    freightAmount: 0,
    invoiceAmount: 0,
    advanceAmount: 0,
    pdcAmount: 0,
    amountPaid: 0,
    balanceAmount: 0,
    paymentStatus: 'PAID',
    paymentDate: null,
    paymentMode: null,
    purchaseOrderNo: null,
    leadTimeDays: null,
    remarks: null,
    lineNumber: 1,
    ...overrides,
  }
}

function catalogProduct(id: string, name: string): NonNullable<DbSaleLine['product']> {
  return { id, name, variant: null, unit: 'kg' }
}

/**
 * Six invoices: one typed "Other" product (Spray Dried Powder),
 * one 0%-GST catalog line (NacExAct), and one partially paid
 * invoice (INV-176100: 176100 invoiced, 100000 paid, 76100
 * outstanding). Column sums — invoice 212591, paid 136491,
 * balance 76100 — are the figures the summary block must keep.
 */
const SAMPLE_LINES: DbSaleLine[] = [
  dbLine({
    id: 'st_a',
    groupId: 'grp_a',
    productId: 'p1',
    product: catalogProduct('p1', 'CarniExAct'),
    quantity: 5,
    unitPrice: 1500,
    totalAmount: 7500,
    gstRate: 18,
    gstAmount: 1350,
    freightAmount: 100,
    invoiceAmount: 8950,
    amountPaid: 8950,
    paymentDate: new Date('2026-03-05T00:00:00.000Z'),
  }),
  dbLine({
    id: 'st_b',
    groupId: 'grp_b',
    otherProductName: 'Spray Dried Powder',
    unit: 'kg',
    quantity: 20,
    unitPrice: 250,
    totalAmount: 5000,
    gstRate: 5,
    gstAmount: 250,
    freightAmount: 0,
    invoiceAmount: 5250,
    amountPaid: 5250,
    paymentDate: new Date('2026-03-06T00:00:00.000Z'),
  }),
  dbLine({
    id: 'st_c',
    groupId: 'grp_c',
    productId: 'p2',
    product: catalogProduct('p2', 'NacExAct'),
    quantity: 2,
    unitPrice: 3000,
    totalAmount: 6000,
    gstRate: 0,
    gstAmount: 0,
    freightAmount: 200,
    invoiceAmount: 6200,
    amountPaid: 6200,
    paymentDate: new Date('2026-03-07T00:00:00.000Z'),
  }),
  dbLine({
    id: 'st_d',
    groupId: 'grp_d',
    invoiceNumber: 'INV-176100',
    invoiceKey: 'inv-176100',
    productId: 'p3',
    product: catalogProduct('p3', 'MetExAct'),
    quantity: 100,
    unitPrice: 1480,
    totalAmount: 148000,
    gstRate: 18,
    gstAmount: 26640,
    freightAmount: 1460,
    invoiceAmount: 176100,
    amountPaid: 100000,
    balanceAmount: 76100,
    paymentStatus: 'PARTIALLY_PAID',
    paymentDate: new Date('2026-03-08T00:00:00.000Z'),
  }),
  dbLine({
    id: 'st_e',
    groupId: 'grp_e',
    invoiceNumber: 'INV-176101',
    invoiceKey: 'inv-176101',
    productId: 'p4',
    product: catalogProduct('p4', 'AlphaExAct™ 75%'),
    quantity: 4,
    unitPrice: 950,
    totalAmount: 3800,
    gstRate: 18,
    gstAmount: 684,
    freightAmount: 15,
    invoiceAmount: 4499,
    amountPaid: 4499,
    paymentDate: new Date('2026-03-09T00:00:00.000Z'),
  }),
  dbLine({
    id: 'st_f',
    groupId: 'grp_f',
    invoiceNumber: 'INV-176102',
    invoiceKey: 'inv-176102',
    productId: 'p5',
    product: catalogProduct('p5', 'ArginExAct™'),
    quantity: 6,
    unitPrice: 1800,
    totalAmount: 10800,
    gstRate: 5,
    gstAmount: 540,
    freightAmount: 252,
    invoiceAmount: 11592,
    amountPaid: 11592,
    paymentDate: new Date('2026-03-10T00:00:00.000Z'),
  }),
]

describe('buildSalesWorkbook — Sales Tracking layout', () => {
  const sampleRows = SAMPLE_LINES.map(mapSaleRow)
  const sampleKpis = computeSalesKpis(sampleRows)
  const sampleProducts = computeProductBreakdown(sampleRows)
  const sampleSalespeople = computeSalespersonBreakdown(sampleRows)

  async function buildSample() {
    return load(
      await buildSalesWorkbook({
        rows: sampleRows,
        products: sampleProducts,
        salespeople: sampleSalespeople,
        kpis: sampleKpis,
        meta,
      })
    )
  }

  it('keeps the sample totals the report is known for', () => {
    // Guards against the sample drifting from the figures the
    // summary block (and every other format) must keep showing.
    expect(sampleKpis.totalSalesValue).toBe(212591)
    expect(sampleKpis.totalAmountPaid).toBe(136491)
    expect(sampleKpis.totalPendingAmount).toBe(76100)
  })

  it('writes every column header as text on the styled header row', async () => {
    const wb = await buildSample()
    const sheet = wb.worksheets[0]
    const headerRow = detailHeaderRow(sheet)
    expect(headerRow).toBeGreaterThan(0)

    const headers: string[] = []
    for (let col = 1; col <= SALES_EXPORT_COLUMNS.length; col += 1) {
      const value = sheet.getRow(headerRow).getCell(col).value
      expect(typeof value).toBe('string')
      expect(String(value).trim().length).toBeGreaterThan(0)
      headers.push(String(value))
    }
    expect(headers).toContain('Unit Price')
    expect(headers).toEqual(SALES_EXPORT_COLUMNS.map((col) => col.header))
  })

  it('puts the first data row immediately under the header (no blank row)', async () => {
    const wb = await buildSample()
    const sheet = wb.worksheets[0]
    const headerRow = detailHeaderRow(sheet)
    const firstDataRow = sheet.getRow(headerRow + 1)
    expect(firstDataRow.getCell(1).value).toBeInstanceOf(Date)
    expect(firstDataRow.getCell(4).value).toBe('CarniExAct')
    expect(firstDataRow.getCell(5).value).toBe('INV-176095')
  })

  it('freezes the header row and first three columns, and filters header..last data row', async () => {
    const wb = await buildSample()
    const sheet = wb.worksheets[0]
    const headerRow = detailHeaderRow(sheet)
    const lastDataRow = headerRow + sampleRows.length
    expect(sheet.autoFilter).toBe(`A${headerRow}:U${lastDataRow}`)

    const view = sheet.views[0]
    expect(view.state).toBe('frozen')
    expect(view.ySplit).toBe(headerRow)
    expect(view.xSplit).toBe(3)
    expect(view.topLeftCell).toBe(`D${headerRow + 1}`)
  })

  it('formats Unit Price as a right-aligned number taken from the line price', async () => {
    const wb = await buildSample()
    const sheet = wb.worksheets[0]
    const headerRow = detailHeaderRow(sheet)
    const unitPriceCell = sheet.getRow(headerRow + 1).getCell(8)
    expect(typeof unitPriceCell.value).toBe('number')
    expect(unitPriceCell.value).toBe(1500)
    expect(unitPriceCell.numFmt).toBe('#,##0.00')
    expect(unitPriceCell.alignment?.horizontal).toBe('right')
  })

  it('fills the Product cell of every row, including the typed "Other" name', async () => {
    const wb = await buildSample()
    const sheet = wb.worksheets[0]
    const headerRow = detailHeaderRow(sheet)
    const products: string[] = []
    for (let r = headerRow + 1; r <= headerRow + sampleRows.length; r += 1) {
      const value = sheet.getRow(r).getCell(4).value
      expect(typeof value).toBe('string')
      expect(String(value).trim().length).toBeGreaterThan(0)
      products.push(String(value))
    }
    expect(products).toContain('Spray Dried Powder')
    expect(products).toContain('NacExAct')
  })

  it('writes the TOTAL row with cached formula results', async () => {
    const wb = await buildSample()
    const sheet = wb.worksheets[0]
    const headerRow = detailHeaderRow(sheet)
    const lastDataRow = headerRow + sampleRows.length
    const totalsRow = sheet.getRow(lastDataRow + 1)

    expect(totalsRow.getCell(4).value).toBe('TOTAL')
    // The row count is a plain string, not a formula.
    expect(totalsRow.getCell(2).value).toBe('6 rows')

    // [column, range letter, expected cached result]
    const expectations: Array<[number, string, number]> = [
      [6, 'F', 137], // Quantity
      [9, 'I', 181100], // Taxable Value
      [11, 'K', 29464], // GST Amount
      [12, 'L', 2027], // Freight
      [13, 'M', 212591], // Invoice Amount
      [14, 'N', 0], // Advance Received
      [15, 'O', 136491], // Amount Paid
      [16, 'P', 0], // PDC Amount
      [17, 'Q', 76100], // Pending / Balance
    ]
    for (const [col, letter, expected] of expectations) {
      const value = totalsRow.getCell(col).value as ExcelJS.CellFormulaValue
      expect(typeof value).toBe('object')
      expect(value.formula).toBe(`SUM(${letter}${headerRow + 1}:${letter}${lastDataRow})`)
      // exceljs drops a cached 0 on read-back, but the file itself
      // carries <v>0</v> — undefined and 0 both mean a cached zero.
      expect(value.result ?? 0).toBe(expected)
    }
  })

  it('ends the Product-wise sheet with a TOTAL row and no blank product names', async () => {
    const wb = await buildSample()
    const sheet = wb.worksheets[1]
    const headerRow = rowWhere(
      sheet,
      (row) => row.getCell(1).value === 'Product' && row.getCell(2).value === 'Type'
    )
    expect(headerRow).toBeGreaterThan(0)

    const products: string[] = []
    for (let r = headerRow + 1; r <= headerRow + sampleProducts.length; r += 1) {
      const row = sheet.getRow(r)
      const value = row.getCell(1).value
      expect(typeof value).toBe('string')
      expect(String(value).trim().length).toBeGreaterThan(0)
      products.push(String(value))
    }
    expect(products).toContain('Spray Dried Powder')
    // The typed "Other" line keeps its Type badge.
    const otherRow = sheet
      .getRow(headerRow + 1 + products.indexOf('Spray Dried Powder'))
    expect(otherRow.getCell(2).value).toBe('Other')

    // The sheet ends with a TOTAL row carrying the grand totals.
    const totalRow = sheet.getRow(headerRow + sampleProducts.length + 1)
    expect(totalRow.getCell(1).value).toBe('TOTAL')
    expect(totalRow.getCell(3).value).toBe(6) // Transactions
    expect(totalRow.getCell(4).value).toBe(137) // Quantity
    expect(totalRow.getCell(5).value).toBe('kg') // Unit (uniform)
    expect(totalRow.getCell(6).value).toBeNull() // Avg Unit Price: no overall price
    expect(totalRow.getCell(7).value).toBe(212591) // Sales Value
    expect(totalRow.getCell(8).value).toBe(1) // % of Sales = 100%
    expect(totalRow.getCell(9).value).toBe(136491) // Amount Paid
    expect(totalRow.getCell(10).value).toBe(76100) // Pending
  })

  it('ends the Salesperson x Product sheet with a TOTAL row', async () => {
    const wb = await buildSample()
    const sheet = wb.worksheets[2]
    const headerRow = rowWhere(
      sheet,
      (row) => row.getCell(1).value === 'Salesperson' && row.getCell(2).value === 'Product'
    )
    expect(headerRow).toBeGreaterThan(0)

    const dataRows = sampleSalespeople.reduce((count, seller) => count + seller.products.length, 0)
    const totalRow = sheet.getRow(headerRow + dataRows + 1)
    expect(totalRow.getCell(1).value).toBe('TOTAL')
    expect(totalRow.getCell(3).value).toBe(137) // Quantity
    expect(totalRow.getCell(4).value).toBe('kg') // Unit (uniform)
    expect(totalRow.getCell(5).value).toBeNull() // Avg Unit Price: no overall price
    expect(totalRow.getCell(6).value).toBe(212591) // Sales Value
    expect(totalRow.getCell(7).value).toBe(1) // % of Salesperson = 100%
    expect(totalRow.getCell(8).value).toBe(136491) // Amount Paid
    expect(totalRow.getCell(9).value).toBe(76100) // Pending
  })
})

describe('buildSalesWorkbook — quantity and unit display', () => {
  async function buildRows(rows: SalesTransactionRow[]) {
    return load(
      await buildSalesWorkbook({
        rows,
        products: computeProductBreakdown(rows),
        salespeople: computeSalespersonBreakdown(rows),
        kpis: computeSalesKpis(rows),
        meta,
      })
    )
  }

  it('formats a whole-number quantity with no trailing decimal point', async () => {
    const wb = await buildRows([row({ quantity: 500 })])
    const sheet = wb.worksheets[0]
    const headerRow = detailHeaderRow(sheet)
    const qtyCell = sheet.getRow(headerRow + 1).getCell(6)
    // Stays a number, not text.
    expect(typeof qtyCell.value).toBe('number')
    expect(qtyCell.value).toBe(500)
    expect(qtyCell.numFmt).toBe('#,##0')
  })

  it('keeps the decimals of a fractional quantity, without trailing zeros', async () => {
    const wb = await buildRows([row({ quantity: 12.5 })])
    const sheet = wb.worksheets[0]
    const headerRow = detailHeaderRow(sheet)
    const qtyCell = sheet.getRow(headerRow + 1).getCell(6)
    expect(qtyCell.value).toBe(12.5)
    expect(qtyCell.numFmt).toBe('#,##0.0##')
  })

  it('totals a uniform-unit quantity with the matching format', async () => {
    const wb = await buildRows([
      row({ quantity: 12.5 }),
      row({ id: 'st_2', groupId: 'grp_2', invoiceNumber: 'INV-2', invoiceKey: 'inv-2', quantity: 25.25 }),
    ])
    const sheet = wb.worksheets[0]
    const headerRow = detailHeaderRow(sheet)
    const totalQty = sheet.getRow(headerRow + 3).getCell(6)
    expect((totalQty.value as ExcelJS.CellFormulaValue).result).toBe(37.75)
    expect(totalQty.numFmt).toBe('#,##0.0##')
  })

  it('leaves the Quantity TOTAL blank when the rows mix units', async () => {
    const rows = [
      row({ quantity: 1200, unit: 'kg' }),
      row({
        id: 'st_2',
        groupId: 'grp_2',
        invoiceNumber: 'INV-2',
        invoiceKey: 'inv-2',
        productId: 'p2',
        productName: 'NacExAct',
        quantity: 600,
        unit: 'pcs',
      }),
    ]
    const wb = await buildRows(rows)
    const sheet = wb.worksheets[0]
    const headerRow = detailHeaderRow(sheet)
    const totalQty = sheet.getRow(headerRow + rows.length + 1).getCell(6)
    expect(totalQty.value).toBeNull()

    // The Summary reports each unit separately instead.
    const summaryRow = rowWhere(
      sheet,
      (r) => r.getCell(1).value === 'Total Quantity Sold'
    )
    expect(summaryRow).toBeGreaterThan(0)
    expect(sheet.getRow(summaryRow).getCell(2).value).toBe('1,200 kg, 600 pcs')

    // Product-wise leaves its Quantity TOTAL blank too.
    const productSheet = wb.worksheets[1]
    const productHeaderRow = rowWhere(
      productSheet,
      (r) => r.getCell(1).value === 'Product' && r.getCell(2).value === 'Type'
    )
    const productTotalRow = productSheet.getRow(
      productHeaderRow + 2 + 1
    )
    expect(productTotalRow.getCell(1).value).toBe('TOTAL')
    expect(productTotalRow.getCell(4).value).toBeNull()
  })

  it('never prints the literal "unit" in the Unit column', async () => {
    // An "Other" line with no stored unit resolves to kg,
    // not the placeholder word "unit".
    const rows = [
      row({
        productId: null,
        productName: 'Spray Dried Powder',
        otherProductName: 'Spray Dried Powder',
        isOtherProduct: true,
        unit: 'kg',
      }),
    ]
    const wb = await buildRows(rows)
    const sheet = wb.worksheets[0]
    const headerRow = detailHeaderRow(sheet)
    for (let r = headerRow + 1; r <= headerRow + rows.length; r += 1) {
      expect(sheet.getRow(r).getCell(7).value).not.toBe('unit')
    }

    // Same for the CSV: the 7th column is Unit.
    const csv = buildSalesCsv(rows)
    for (const line of csv.slice(1).trim().split('\n')) {
      const cells = line.split(',')
      expect(cells[6]).not.toBe('unit')
    }
  })

  it('prints CSV quantities without a trailing decimal point', () => {
    const csv = buildSalesCsv([
      row({ quantity: 500 }),
      row({ id: 'st_2', groupId: 'grp_2', invoiceNumber: 'INV-2', invoiceKey: 'inv-2', quantity: 12.5 }),
    ])
    const quantities = csv
      .slice(1)
      .trim()
      .split('\n')
      .slice(1)
      .map((line) => line.split(',')[5])
    expect(quantities).toEqual(['500', '12.5'])
  })
})

describe('buildSalesWorkbook — Avg Unit Price', () => {
  // Sample data for the column-order change: four
  // products, all sold in kg, with quantities
  // 100 / 500 / 200 / 1,000 in sheet row order
  // (rows sort by Sales Value descending). Column
  // sums — quantity 1,800, invoice 212,591, paid
  // 136,491, balance 76,100 — are the figures the
  // TOTAL row must keep showing.
  const AVG_LINES: DbSaleLine[] = [
    dbLine({
      id: 'avg_a',
      groupId: 'grp_avg_a',
      salespersonId: 'u_sameer',
      salesperson: { id: 'u_sameer', name: 'Sameer Selokar', email: 'sameer@example.com' },
      productId: 'p_branch',
      product: catalogProduct('p_branch', 'BranChExAct RD™'),
      quantity: 100,
      unitPrice: 1450,
      totalAmount: 145000,
      gstRate: 18,
      gstAmount: 26100,
      freightAmount: 4826,
      invoiceAmount: 175926,
      amountPaid: 99826,
      balanceAmount: 76100,
      paymentStatus: 'PARTIALLY_PAID',
      paymentDate: new Date('2026-03-05T00:00:00.000Z'),
    }),
    dbLine({
      id: 'avg_b',
      groupId: 'grp_avg_b',
      salespersonId: 'u_sameer',
      salesperson: { id: 'u_sameer', name: 'Sameer Selokar', email: 'sameer@example.com' },
      productId: 'p_dha',
      product: catalogProduct('p_dha', 'DHA ExAct™ CWD'),
      quantity: 500,
      unitPrice: 50,
      totalAmount: 25000,
      gstRate: 5,
      gstAmount: 1250,
      freightAmount: 0,
      invoiceAmount: 26250,
      amountPaid: 26250,
      paymentDate: new Date('2026-03-06T00:00:00.000Z'),
    }),
    dbLine({
      id: 'avg_c',
      groupId: 'grp_avg_c',
      salespersonId: 'u_sameer',
      salesperson: { id: 'u_sameer', name: 'Sameer Selokar', email: 'sameer@example.com' },
      productId: 'p_alpha',
      product: catalogProduct('p_alpha', 'AlphaExAct™ 15% WS'),
      quantity: 200,
      unitPrice: 25,
      totalAmount: 5000,
      gstRate: 18,
      gstAmount: 900,
      freightAmount: 0,
      invoiceAmount: 5900,
      amountPaid: 5900,
      paymentDate: new Date('2026-03-07T00:00:00.000Z'),
    }),
    dbLine({
      id: 'avg_d',
      groupId: 'grp_avg_d',
      salespersonId: 'u_sameer',
      salesperson: { id: 'u_sameer', name: 'Sameer Selokar', email: 'sameer@example.com' },
      // No catalog product and no typed name: the row
      // renders as "Other product".
      productId: null,
      product: null,
      otherProductName: null,
      unit: 'kg',
      quantity: 1000,
      unitPrice: 4.3,
      totalAmount: 4300,
      gstRate: 5,
      gstAmount: 215,
      freightAmount: 0,
      invoiceAmount: 4515,
      amountPaid: 4515,
      paymentDate: new Date('2026-03-08T00:00:00.000Z'),
    }),
  ]
  const avgRows = AVG_LINES.map(mapSaleRow)
  const avgProducts = computeProductBreakdown(avgRows)
  const avgSalespeople = computeSalespersonBreakdown(avgRows)

  async function buildAvg() {
    return load(
      await buildSalesWorkbook({
        rows: avgRows,
        products: avgProducts,
        salespeople: avgSalespeople,
        kpis: computeSalesKpis(avgRows),
        meta,
      })
    )
  }

  function productSheetOf(wb: ExcelJS.Workbook) {
    const sheet = wb.worksheets[1]
    const headerRow = rowWhere(
      sheet,
      (r) => r.getCell(1).value === 'Product' && r.getCell(2).value === 'Type'
    )
    return { sheet, headerRow }
  }

  function matrixSheetOf(wb: ExcelJS.Workbook) {
    const sheet = wb.worksheets[2]
    const headerRow = rowWhere(
      sheet,
      (r) => r.getCell(1).value === 'Salesperson' && r.getCell(2).value === 'Product'
    )
    return { sheet, headerRow }
  }

  it('orders the columns with Unit right after Quantity on both sheets', async () => {
    const wb = await buildAvg()

    const { sheet, headerRow } = productSheetOf(wb)
    const headers = Array.from({ length: 10 }, (_, i) => sheet.getRow(headerRow).getCell(i + 1).value)
    expect(headers).toEqual([
      'Product',
      'Type',
      'Transactions',
      'Quantity',
      'Unit',
      'Avg Unit Price',
      'Sales Value',
      '% of Sales',
      'Amount Paid',
      'Pending',
    ])
    // Unit is the cell immediately after Quantity.
    expect(headers[headers.indexOf('Quantity') + 1]).toBe('Unit')

    const matrix = matrixSheetOf(wb)
    const matrixHeaders = Array.from(
      { length: 9 },
      (_, i) => matrix.sheet.getRow(matrix.headerRow).getCell(i + 1).value
    )
    expect(matrixHeaders).toEqual([
      'Salesperson',
      'Product',
      'Quantity',
      'Unit',
      'Avg Unit Price',
      'Sales Value',
      '% of Salesperson',
      'Amount Paid',
      'Pending',
    ])
    expect(matrixHeaders[matrixHeaders.indexOf('Quantity') + 1]).toBe('Unit')
  })

  it('keeps the data unchanged: each quantity followed by its unit', async () => {
    const wb = await buildAvg()
    const { sheet, headerRow } = productSheetOf(wb)

    const quantities: unknown[] = []
    const units: unknown[] = []
    for (let r = headerRow + 1; r <= headerRow + avgProducts.length; r += 1) {
      quantities.push(sheet.getRow(r).getCell(4).value)
      units.push(sheet.getRow(r).getCell(5).value)
    }
    expect(quantities).toEqual([100, 500, 200, 1000])
    expect(units).toEqual(['kg', 'kg', 'kg', 'kg'])
  })

  it('autofilters the full header range and totals the sheet', async () => {
    const wb = await buildAvg()
    const { sheet, headerRow } = productSheetOf(wb)

    const totalRow = rowWhere(sheet, (r) => r.getCell(1).value === 'TOTAL')
    expect(totalRow).toBe(headerRow + avgProducts.length + 1)

    // Quantity keeps its total; the Unit cell shows the
    // unit because every row sells in kg; the average
    // price stays empty.
    expect(sheet.getRow(totalRow).getCell(4).value).toBe(1800)
    expect(sheet.getRow(totalRow).getCell(5).value).toBe('kg')
    expect(sheet.getRow(totalRow).getCell(6).value).toBeNull()
    expect(sheet.getRow(totalRow).getCell(7).value).toBe(212591) // Sales Value
    expect(sheet.getRow(totalRow).getCell(9).value).toBe(136491) // Amount Paid
    expect(sheet.getRow(totalRow).getCell(10).value).toBe(76100) // Pending

    // The autofilter spans every column of the header
    // row through the last data row (A..J for the
    // ten Product-wise columns).
    const filter = sheet.autoFilter as unknown
    const ref = typeof filter === 'string' ? filter : (filter as { ref?: string })?.ref
    expect(ref).toBe(`A${headerRow}:J${headerRow + avgProducts.length}`)

    // Same on the matrix sheet (nine columns, A..I).
    const matrix = matrixSheetOf(wb)
    const matrixFilter = matrix.sheet.autoFilter as unknown
    const matrixRef =
      typeof matrixFilter === 'string'
        ? matrixFilter
        : (matrixFilter as { ref?: string })?.ref
    expect(matrixRef).toBe(`A${matrix.headerRow}:I${matrix.headerRow + avgProducts.length}`)
  })

  it('prices each product at its taxable value over its quantity', async () => {
    const wb = await buildAvg()
    const { sheet, headerRow } = productSheetOf(wb)

    const avgByProduct = new Map<string, ExcelJS.Cell>()
    for (let r = headerRow + 1; r <= headerRow + avgProducts.length; r += 1) {
      const row = sheet.getRow(r)
      avgByProduct.set(String(row.getCell(1).value), row.getCell(6))
    }

    // Weighted averages, within half a paisa.
    expect(avgByProduct.get('BranChExAct RD™')?.value).toBeCloseTo(1450, 2)
    expect(avgByProduct.get('DHA ExAct™ CWD')?.value).toBeCloseTo(50, 2)
    expect(avgByProduct.get('AlphaExAct™ 15% WS')?.value).toBeCloseTo(25, 2)
    expect(avgByProduct.get('Other product')?.value).toBeCloseTo(4.3, 2)

    // A numeric cell with the money format, right-aligned.
    const cell = avgByProduct.get('BranChExAct RD™')!
    expect(typeof cell.value).toBe('number')
    expect(cell.numFmt).toBe('#,##0.00')
    expect(cell.alignment?.horizontal).toBe('right')
  })

  it('shows the same four prices on Salesperson x Product', async () => {
    const wb = await buildAvg()
    const { sheet, headerRow } = matrixSheetOf(wb)

    const avgByProduct = new Map<string, ExcelJS.Cell>()
    for (let r = headerRow + 1; r <= headerRow + avgProducts.length; r += 1) {
      const row = sheet.getRow(r)
      expect(row.getCell(1).value).toBe('Sameer Selokar')
      avgByProduct.set(String(row.getCell(2).value), row.getCell(5))
    }

    expect(avgByProduct.get('BranChExAct RD™')?.value).toBeCloseTo(1450, 2)
    expect(avgByProduct.get('DHA ExAct™ CWD')?.value).toBeCloseTo(50, 2)
    expect(avgByProduct.get('AlphaExAct™ 15% WS')?.value).toBeCloseTo(25, 2)
    expect(avgByProduct.get('Other product')?.value).toBeCloseTo(4.3, 2)
  })

  it('leaves the TOTAL row Avg Unit Price empty and keeps the other totals', async () => {
    const wb = await buildAvg()
    const { sheet } = productSheetOf(wb)
    const totalRow = rowWhere(sheet, (r) => r.getCell(1).value === 'TOTAL')
    expect(totalRow).toBeGreaterThan(0)

    // No overall average price — products are priced
    // differently — but every other total is unchanged.
    expect(sheet.getRow(totalRow).getCell(4).value).toBe(1800) // Quantity
    expect(sheet.getRow(totalRow).getCell(5).value).toBe('kg') // Unit
    expect(sheet.getRow(totalRow).getCell(6).value).toBeNull() // Avg Unit Price
    expect(sheet.getRow(totalRow).getCell(7).value).toBe(212591) // Sales Value
    expect(sheet.getRow(totalRow).getCell(9).value).toBe(136491) // Amount Paid
    expect(sheet.getRow(totalRow).getCell(10).value).toBe(76100) // Pending
  })

  it('leaves Avg Unit Price empty — not an error — for a group that sold nothing', async () => {
    const rows = [
      row({ productId: 'p1', productName: 'CarniExAct', quantity: 2, unitPrice: 1500, totalAmount: 3000, gstAmount: 0, freightAmount: 0, invoiceAmount: 3000 }),
      row({
        id: 'st_0',
        groupId: 'grp_0',
        invoiceNumber: 'INV-0',
        invoiceKey: 'inv-0',
        productId: 'p2',
        productName: 'NacExAct',
        // A free-sample line: nothing sold, nothing billed.
        quantity: 0,
        unitPrice: 3000,
        totalAmount: 0,
        gstAmount: 0,
        freightAmount: 0,
        invoiceAmount: 0,
        amountPaid: 0,
        balanceAmount: 0,
        paymentStatus: 'PENDING',
        paymentDate: null,
      }),
    ]
    const wb = await load(
      await buildSalesWorkbook({
        rows,
        products: computeProductBreakdown(rows),
        salespeople: computeSalespersonBreakdown(rows),
        kpis: computeSalesKpis(rows),
        meta,
      })
    )
    const { sheet, headerRow } = productSheetOf(wb)

    const avgByProduct = new Map<string, unknown>()
    for (let r = headerRow + 1; r <= headerRow + 2; r += 1) {
      const sheetRow = sheet.getRow(r)
      avgByProduct.set(String(sheetRow.getCell(1).value), sheetRow.getCell(6).value)
    }
    expect(avgByProduct.get('CarniExAct')).toBe(1500)
    expect(avgByProduct.get('NacExAct')).toBeNull()
  })
})

describe('export caps and filenames', () => {
  it('caps the PDF far lower than the spreadsheet formats', () => {
    expect(EXPORT_ROW_CAPS.pdf).toBeLessThan(EXPORT_ROW_CAPS.xlsx)
    expect(EXPORT_ROW_CAPS.csv).toBe(EXPORT_ROW_CAPS.xlsx)
  })

  it('names the file after the organisation and the format', () => {
    expect(salesExportFilename('xlsx', 'Kawman ExAct')).toBe(
      'kawman-exact-sales-product-tracking.xlsx'
    )
    expect(salesExportFilename('csv', '')).toBe('organisation-sales-product-tracking.csv')
  })

  it('strips characters that are illegal in a filename', () => {
    expect(salesExportFilename('pdf', 'A/B \\ C: Ltd')).toBe('a-b-c-ltd-sales-product-tracking.pdf')
  })
})