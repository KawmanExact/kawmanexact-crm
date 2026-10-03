import { describe, it, expect } from 'vitest'
import {
  computeProductBreakdown,
  computeSalesKpis,
  computeSalespersonBreakdown,
  deriveLineMoney,
} from './sales.service'
import type { SalesTransactionRow } from '@/types/sales'

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
    unitPrice: 100,
    totalAmount: 200,
    amountPaid: 200,
    balanceAmount: 0,
    paymentStatus: 'PAID',
    paymentDate: '2026-03-05',
    saleDate: '2026-03-01T00:00:00.000Z',
    invoiceNumber: 'INV-1',
    lineNumber: 1,
    remarks: null,
    ...overrides,
  }
}

describe('computeSalesKpis', () => {
  it('counts DISTINCT invoices, not rows', () => {
    const kpis = computeSalesKpis([
      row({ id: 'a', groupId: 'grp_1', lineNumber: 1 }),
      row({ id: 'b', groupId: 'grp_1', lineNumber: 2, productId: 'p2', productName: 'AlphaExAct' }),
      row({ id: 'c', groupId: 'grp_2', invoiceNumber: 'INV-2', lineNumber: 1 }),
    ])
    expect(kpis.totalSales).toBe(2)
    expect(kpis.transactionCount).toBe(3)
  })

  it('sums value, paid and the derived pending balance', () => {
    const kpis = computeSalesKpis([
      row({ totalAmount: 200, amountPaid: 200 }),
      row({ id: 'b', groupId: 'grp_2', invoiceNumber: 'INV-2', totalAmount: 300, amountPaid: 100 }),
    ])
    expect(kpis.totalSalesValue).toBe(500)
    expect(kpis.totalAmountPaid).toBe(300)
    expect(kpis.totalPendingAmount).toBe(200)
  })

  it('reports quantity per unit when the rows share a unit', () => {
    const kpis = computeSalesKpis([
      row({ quantity: 2, unit: 'kg' }),
      row({ id: 'b', quantity: 3, unit: 'kg', productId: 'p2', productName: 'X' }),
    ])
    expect(kpis.totalQuantity).toBe(5)
    expect(kpis.quantityByUnit).toEqual([{ unit: 'kg', quantity: 5 }])
  })

  it('refuses to add kg to litres: totalQuantity is null and the breakdown is per unit', () => {
    const kpis = computeSalesKpis([
      row({ quantity: 2, unit: 'kg' }),
      row({ id: 'b', quantity: 3, unit: 'litre', productId: 'p2', productName: 'X' }),
    ])
    expect(kpis.totalQuantity).toBeNull()
    expect(kpis.quantityByUnit).toEqual([
      { unit: 'kg', quantity: 2 },
      { unit: 'litre', quantity: 3 },
    ])
  })

  it('counts DISTINCT products, treating a typed "Other" by its name', () => {
    const kpis = computeSalesKpis([
      row({ productId: 'p1' }),
      row({ id: 'b', productId: null, productName: 'Curcumin', otherProductName: 'Curcumin', isOtherProduct: true }),
      row({ id: 'c', productId: null, productName: 'Curcumin', otherProductName: 'curcumin', isOtherProduct: true }),
    ])
    // The two "Other" rows collapse to one product key because the key is
    // lower-cased, so the distinct count is 2 rather than 3.
    expect(kpis.totalProductsSold).toBe(2)
  })

  it('handles an empty row set without NaN', () => {
    const kpis = computeSalesKpis([])
    expect(kpis.totalSales).toBe(0)
    expect(kpis.transactionCount).toBe(0)
    expect(kpis.totalQuantity).toBe(0)
    expect(kpis.totalSalesValue).toBe(0)
    expect(kpis.totalPendingAmount).toBe(0)
  })

  it('accumulates money in Decimal, not as floats', () => {
    const kpis = computeSalesKpis([
      row({ totalAmount: 0.1, amountPaid: 0.1 }),
      row({ id: 'b', groupId: 'g2', invoiceNumber: 'I2', totalAmount: 0.2, amountPaid: 0.2 }),
    ])
    expect(kpis.totalSalesValue).toBe(0.3)
  })
})

describe('computeProductBreakdown', () => {
  it('groups by product and totals value, paid and pending', () => {
    const rows = computeProductBreakdown([
      row({ quantity: 2, totalAmount: 200, amountPaid: 200 }),
      row({ id: 'b', quantity: 1, totalAmount: 100, amountPaid: 50 }),
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0].productName).toBe('CarniExAct')
    expect(rows[0].quantity).toBe(3)
    expect(rows[0].totalValue).toBe(300)
    expect(rows[0].amountPaid).toBe(250)
    expect(rows[0].pendingAmount).toBe(50)
    expect(rows[0].transactionCount).toBe(2)
  })

  it('gives each product its share of the filtered sales value', () => {
    const rows = computeProductBreakdown([
      row({ productId: 'p1', productName: 'A', totalAmount: 750, amountPaid: 750 }),
      row({ id: 'b', productId: 'p2', productName: 'B', totalAmount: 250, amountPaid: 250 }),
    ])
    const byName = Object.fromEntries(rows.map((r) => [r.productName, r.share]))
    expect(byName.A).toBe(75)
    expect(byName.B).toBe(25)
  })

  it('shares sum to 100 across products', () => {
    const rows = computeProductBreakdown([
      row({ productId: 'p1', productName: 'A', totalAmount: 333.33, amountPaid: 333.33 }),
      row({ id: 'b', productId: 'p2', productName: 'B', totalAmount: 333.33, amountPaid: 333.33 }),
      row({ id: 'c', productId: 'p3', productName: 'C', totalAmount: 333.34, amountPaid: 333.34 }),
    ])
    const total = rows.reduce((sum, r) => sum + r.share, 0)
    expect(total).toBeCloseTo(100, 1)
  })

  it('gives every row a stable key, including for typed "Other" products', () => {
    const rows = computeProductBreakdown([
      row({ productId: 'p1', productName: 'A' }),
      row({ id: 'b', productId: null, productName: 'Curcumin', otherProductName: 'Curcumin', isOtherProduct: true }),
    ])
    expect(rows[0].key).toBe('p1')
    expect(rows[1].key).toBe('other:curcumin')
    expect(rows[1].isOther).toBe(true)
  })

  it('is 0% share, not NaN, when the filtered set is empty', () => {
    expect(computeProductBreakdown([])).toEqual([])
  })

  it('is an empty list, not a divide-by-zero NaN, when the total value is zero', () => {
    const rows = computeProductBreakdown([row({ totalAmount: 0, amountPaid: 0 })])
    expect(rows).toHaveLength(1)
    expect(Number.isNaN(rows[0].share)).toBe(false)
  })
})

describe('computeSalespersonBreakdown', () => {
  it('groups by salesperson and keeps their product breakdown', () => {
    const rows = computeSalespersonBreakdown([
      row({ salespersonId: 'u1', salespersonName: 'Priya', productId: 'p1', productName: 'A', totalAmount: 100, amountPaid: 100 }),
      row({ id: 'b', salespersonId: 'u2', salespersonName: 'Ravi', productId: 'p2', productName: 'B', totalAmount: 300, amountPaid: 100 }),
    ])
    expect(rows.map((r) => r.salespersonName)).toEqual(['Ravi', 'Priya'])
    const ravi = rows.find((r) => r.salespersonId === 'u2')!
    expect(ravi.totalSalesValue).toBe(300)
    expect(ravi.amountPaid).toBe(100)
    expect(ravi.pendingAmount).toBe(200)
    expect(ravi.products[0].productName).toBe('B')
  })

  it('reports per-unit quantity for each person instead of a hardcoded unit', () => {
    const rows = computeSalespersonBreakdown([
      row({ salespersonId: 'u1', salespersonName: 'Priya', quantity: 2, unit: 'kg' }),
      row({ id: 'b', salespersonId: 'u1', salespersonName: 'Priya', quantity: 3, unit: 'litre', productId: 'p2', productName: 'B' }),
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0].totalQuantity).toBeNull()
    expect(rows[0].quantityByUnit).toEqual([
      { unit: 'kg', quantity: 2 },
      { unit: 'litre', quantity: 3 },
    ])
  })

  it('gives a single total when one person sold a single unit', () => {
    const rows = computeSalespersonBreakdown([
      row({ salespersonId: 'u1', salespersonName: 'Priya', quantity: 2.5, unit: 'kg' }),
    ])
    expect(rows[0].totalQuantity).toBe(2.5)
  })

  it('is an empty list for an empty row set', () => {
    expect(computeSalespersonBreakdown([])).toEqual([])
  })
})

describe('deriveLineMoney', () => {
  it('recomputes total, balance and status from quantity x unitPrice', () => {
    const money = deriveLineMoney({ quantity: '2', unitPrice: '150.50', amountPaid: '0' })
    expect(money.totalAmount.toFixed()).toBe('301')
    expect(money.balanceAmount.toFixed()).toBe('301')
    expect(money.paymentStatus).toBe('PENDING')
  })

  it('never trusts a client-sent total: it is derived every time', () => {
    const money = deriveLineMoney({ quantity: 3, unitPrice: 10, amountPaid: 30 })
    expect(money.totalAmount.toFixed()).toBe('30')
    expect(money.balanceAmount.toFixed()).toBe('0')
    expect(money.paymentStatus).toBe('PAID')
  })

  it('derives PARTIALLY_PAID for a strict partial payment', () => {
    const money = deriveLineMoney({ quantity: 1, unitPrice: 100, amountPaid: 40 })
    expect(money.paymentStatus).toBe('PARTIALLY_PAID')
    expect(money.balanceAmount.toFixed()).toBe('60')
  })

  it('clamps the balance at zero when the payment exceeds the total', () => {
    const money = deriveLineMoney({ quantity: 1, unitPrice: 100, amountPaid: 200 })
    expect(money.balanceAmount.toFixed()).toBe('0')
    expect(money.paymentStatus).toBe('PAID')
  })

  it('keeps quantity at three decimals and money at two', () => {
    const money = deriveLineMoney({ quantity: '1.23456', unitPrice: '10.129', amountPaid: '0' })
    expect(money.quantity.toFixed()).toBe('1.235')
    expect(money.unitPrice.toFixed()).toBe('10.13')
  })
})