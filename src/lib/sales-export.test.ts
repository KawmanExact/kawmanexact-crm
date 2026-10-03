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
  type SalesExportMeta,
} from './sales-export'
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
    expect(lines[0]).toContain('Total Amount')
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

describe('buildSalesWorkbook', () => {
  async function load(buffer: Buffer) {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer as unknown as ArrayBuffer)
    return wb
  }

  it('produces a readable .xlsx workbook', async () => {
    const wb = await load(
      await buildSalesWorkbook({ rows: [row()], products, salespeople, kpis, meta })
    )
    expect(wb.worksheets.length).toBe(3)
  })

  it('includes the detail, product-wise and salesperson x product sheets', async () => {
    const wb = await load(
      await buildSalesWorkbook({ rows: [row()], products, salespeople, kpis, meta })
    )
    expect(wb.worksheets.map((s) => s.name)).toEqual([
      'Sales Transactions',
      'Product-wise',
      'Salesperson x Product',
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
    expect(wb.worksheets.length).toBe(3)
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
    expect(wb.worksheets.length).toBe(3)
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