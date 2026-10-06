import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  prisma: {
    deal: { findMany: vi.fn() },
  },
}))

vi.mock('@/lib/session', () => ({
  requireApiSession: vi.fn(),
}))

import { prisma } from '@/lib/db'
import { requireApiSession } from '@/lib/session'
import {
  getProductSalesByEmployee,
  PRODUCT_SALES_TOTAL_OWNER,
  type ProductSalesByEmployeeRow,
} from './crm-reports.service'

const mockDealFindMany = vi.mocked(prisma.deal.findMany)
const mockRequireApiSession = vi.mocked(requireApiSession)

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
// There is no test database in this project (see the note in
// vitest.config.mts), so the Prisma mock is a tiny in-memory reader that
// honours the *same* clauses the service pushes down: organizationId, stage,
// the [from, to) closedAt window, and whatever owner-scope clause
// ownerScopeWhere produced. That makes the scoping assertions real: if the
// service forgot organizationId or the scope clause, the filtered rows change
// instead of the test quietly passing.
// ---------------------------------------------------------------------------

interface SeedItem {
  productId: string | null
  productName: string | null
  productVariant: string | null
  quantity: number
  unitPrice: number
  unitCost: number
}

interface SeedDeal {
  id: string
  organizationId: string
  ownerId: string
  ownerName: string
  ownerDepartmentId: string | null
  stage: string
  closedAt: Date | null
  items: SeedItem[]
}

function item(overrides: Partial<SeedItem> & Pick<SeedItem, 'quantity' | 'unitPrice' | 'unitCost'>): SeedItem {
  return { productId: null, productName: null, productVariant: null, ...overrides }
}

const PRODUCTS = {
  carni: { productId: 'prod-carni', productName: 'CarniExAct', productVariant: null },
  curcumin: { productId: 'prod-curcumin', productName: 'Curcumin', productVariant: 'Food Grade' },
}

const SEED: SeedDeal[] = [
  // Won, in range, two line items — the report's main subject.
  {
    id: 'deal-1',
    organizationId: 'org-1',
    ownerId: 'rep-1',
    ownerName: 'Priya Sharma',
    ownerDepartmentId: 'dept-1',
    stage: 'PAYMENT',
    closedAt: new Date('2026-03-10T09:00:00.000Z'),
    items: [
      item({ ...PRODUCTS.carni, quantity: 10, unitPrice: 100, unitCost: 60 }),
      item({ ...PRODUCTS.curcumin, quantity: 5, unitPrice: 200, unitCost: 150 }),
    ],
  },
  // Won, in range, no line items — must not appear anywhere.
  {
    id: 'deal-2',
    organizationId: 'org-1',
    ownerId: 'rep-1',
    ownerName: 'Priya Sharma',
    ownerDepartmentId: 'dept-1',
    stage: 'PAYMENT',
    closedAt: new Date('2026-03-15T09:00:00.000Z'),
    items: [],
  },
  // Won, but closed outside the window.
  {
    id: 'deal-3',
    organizationId: 'org-1',
    ownerId: 'rep-1',
    ownerName: 'Priya Sharma',
    ownerDepartmentId: 'dept-1',
    stage: 'PAYMENT',
    closedAt: new Date('2026-05-01T09:00:00.000Z'),
    items: [item({ ...PRODUCTS.carni, quantity: 999, unitPrice: 100, unitCost: 60 })],
  },
  // Won but still open-dated — closedAt is null, so it is not booked revenue.
  {
    id: 'deal-4',
    organizationId: 'org-1',
    ownerId: 'rep-1',
    ownerName: 'Priya Sharma',
    ownerDepartmentId: 'dept-1',
    stage: 'PAYMENT',
    closedAt: null,
    items: [item({ ...PRODUCTS.carni, quantity: 999, unitPrice: 100, unitCost: 60 })],
  },
  // Lost — never revenue.
  {
    id: 'deal-5',
    organizationId: 'org-1',
    ownerId: 'rep-1',
    ownerName: 'Priya Sharma',
    ownerDepartmentId: 'dept-1',
    stage: 'LOST',
    closedAt: new Date('2026-03-12T09:00:00.000Z'),
    items: [item({ ...PRODUCTS.carni, quantity: 999, unitPrice: 100, unitCost: 60 })],
  },
  // Still in the pipeline — not closed, not won.
  {
    id: 'deal-6',
    organizationId: 'org-1',
    ownerId: 'rep-1',
    ownerName: 'Priya Sharma',
    ownerDepartmentId: 'dept-1',
    stage: 'NEGOTIATION',
    closedAt: null,
    items: [item({ ...PRODUCTS.carni, quantity: 999, unitPrice: 100, unitCost: 60 })],
  },
  // Won, in range, a different employee in the same org.
  {
    id: 'deal-7',
    organizationId: 'org-1',
    ownerId: 'rep-2',
    ownerName: 'Ravi Menon',
    ownerDepartmentId: 'dept-2',
    stage: 'PAYMENT',
    closedAt: new Date('2026-03-20T09:00:00.000Z'),
    items: [item({ ...PRODUCTS.carni, quantity: 4, unitPrice: 100, unitCost: 70 })],
  },
  // Won, in range, a DIFFERENT ORG — must never leak in.
  {
    id: 'deal-8',
    organizationId: 'org-2',
    ownerId: 'rep-3',
    ownerName: 'Other Tenant Rep',
    ownerDepartmentId: null,
    stage: 'PAYMENT',
    closedAt: new Date('2026-03-11T09:00:00.000Z'),
    items: [item({ ...PRODUCTS.carni, quantity: 5000, unitPrice: 1, unitCost: 1 })],
  },
]

type DealArgs = {
  where: {
    organizationId?: string
    stage?: string | { in?: string[]; notIn?: string[] }
    closedAt?: { gte?: Date; lte?: Date; lt?: Date }
    ownerId?: string
    owner?: { departmentId?: string }
  }
}

function findRow(
  rows: ProductSalesByEmployeeRow[],
  ownerName: string,
  productName: string,
): ProductSalesByEmployeeRow {
  const row = rows.find((r) => r.ownerName === ownerName && r.productName === productName)
  if (!row) throw new Error(`no row for ${ownerName} / ${productName} in [${rows.map((r) => `${r.ownerName}/${r.productName}`).join(', ')}]`)
  return row
}

function seedReader(args: DealArgs) {
  const { where } = args
  return SEED.filter((deal) => {
    if (where.organizationId !== undefined && deal.organizationId !== where.organizationId) return false
    if (typeof where.stage === 'string' && deal.stage !== where.stage) return false
    if (where.closedAt) {
      if (!deal.closedAt) return false
      if (where.closedAt.gte && deal.closedAt < where.closedAt.gte) return false
      if (where.closedAt.lt && deal.closedAt >= where.closedAt.lt) return false
      if (where.closedAt.lte && deal.closedAt > where.closedAt.lte) return false
    }
    if (where.ownerId !== undefined && deal.ownerId !== where.ownerId) return false
    if (where.owner?.departmentId !== undefined && deal.ownerDepartmentId !== where.owner.departmentId) {
      return false
    }
    return true
  })
}

const adminSession = {
  user: {
    id: 'admin-1',
    email: 'admin@org-1.test',
    name: 'Org Admin',
    organizationId: 'org-1',
    roles: ['ADMIN'],
    permissions: ['reports.view_all'],
  },
}

const repSession = {
  user: {
    id: 'rep-1',
    email: 'priya@org-1.test',
    name: 'Priya Sharma',
    organizationId: 'org-1',
    roles: ['SALES_EXECUTIVE'],
    permissions: ['reports.view'],
  },
}

const managerSession = {
  user: {
    id: 'mgr-1',
    email: 'mgr@org-1.test',
    name: 'Dept Manager',
    organizationId: 'org-1',
    roles: ['MANAGER'],
    department: { id: 'dept-1' },
    permissions: ['reports.view', 'team.view'],
  },
}

const WINDOW = {
  from: new Date('2026-03-01T00:00:00.000Z'),
  to: new Date('2026-04-01T00:00:00.000Z'),
}

describe('crm-reports.service — getProductSalesByEmployee', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDealFindMany.mockImplementation((async (args: unknown) =>
      seedReader(args as DealArgs).map((deal) => ({
        ownerId: deal.ownerId,
        owner: { name: deal.ownerName },
        items: deal.items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          unitCost: i.unitCost,
          product: i.productName
            ? { name: i.productName, variant: i.productVariant }
            : null,
        })),
      }))) as never)
  })

  it('queries won deals inside a half-open [from, to) window, org-scoped', async () => {
    mockRequireApiSession.mockResolvedValue(adminSession)
    await getProductSalesByEmployee(WINDOW)

    expect(mockDealFindMany).toHaveBeenCalledTimes(1)
    const call = mockDealFindMany.mock.calls[0][0] as unknown as DealArgs
    expect(call.where.organizationId).toBe('org-1')
    expect(call.where.stage).toBe('PAYMENT')
    expect(call.where.closedAt).toEqual({ gte: WINDOW.from, lt: WINDOW.to })
  })

  it('never selects the deal headline value — revenue is rebuilt from line items', async () => {
    mockRequireApiSession.mockResolvedValue(adminSession)
    await getProductSalesByEmployee(WINDOW)

    const call = mockDealFindMany.mock.calls[0][0] as unknown as {
      select: { items: { select: Record<string, unknown> } }
    }
    expect(call.select.items.select).toHaveProperty('quantity')
    expect(call.select.items.select).toHaveProperty('unitPrice')
    expect(call.select.items.select).toHaveProperty('unitCost')
    expect(Object.keys(call.select)).not.toContain('value')
  })

  it('excludes lost, unclosed, out-of-range, itemless and other-org deals', async () => {
    mockRequireApiSession.mockResolvedValue(adminSession)
    const { rows } = await getProductSalesByEmployee(WINDOW)

    // deal-3 (out of range), deal-4 (closedAt null), deal-5 (LOST),
    // deal-6 (NEGOTIATION) and deal-8 (other org) all carry a 999/5000-unit
    // sentinel line, so any leak shows up as an inflated total.
    expect(rows.map((r) => `${r.ownerName}/${r.productName}`)).toEqual([
      'Priya Sharma/CarniExAct',
      'Priya Sharma/Curcumin - Food Grade',
      'Ravi Menon/CarniExAct',
    ])
    expect(rows.reduce((sum, r) => sum + r.quantity, 0)).toBe(19)
  })

  it('computes quantity, revenue, cost, profit and margin per employee x product', async () => {
    mockRequireApiSession.mockResolvedValue(adminSession)
    const { rows } = await getProductSalesByEmployee(WINDOW)

    expect(findRow(rows, 'Priya Sharma', 'CarniExAct')).toMatchObject({
      ownerId: 'rep-1',
      productId: 'prod-carni',
      quantity: 10,
      revenue: 1000,
      cost: 600,
      profit: 400,
    })
    expect(findRow(rows, 'Priya Sharma', 'CarniExAct').margin).toBeCloseTo(0.4, 10)

    expect(findRow(rows, 'Priya Sharma', 'Curcumin - Food Grade')).toMatchObject({
      productId: 'prod-curcumin',
      quantity: 5,
      revenue: 1000,
      cost: 750,
      profit: 250,
    })
    expect(findRow(rows, 'Priya Sharma', 'Curcumin - Food Grade').margin).toBeCloseTo(0.25, 10)

    expect(findRow(rows, 'Ravi Menon', 'CarniExAct')).toMatchObject({
      ownerId: 'rep-2',
      quantity: 4,
      revenue: 400,
      cost: 280,
      profit: 120,
    })
    expect(findRow(rows, 'Ravi Menon', 'CarniExAct').margin).toBeCloseTo(0.3, 10)
  })

  it('merges the same product across several of an employee\'s deals into one row', async () => {
    mockRequireApiSession.mockResolvedValue(adminSession)
    const { rows } = await getProductSalesByEmployee(WINDOW)

    const carni = rows.filter((r) => r.productId === 'prod-carni')
    expect(carni).toHaveLength(2)
    // Priya has one CarniExAct line and Ravi has one; neither is duplicated.
    expect(carni.find((r) => r.ownerId === 'rep-1')?.quantity).toBe(10)
  })

  it('rolls up per-employee totals and a grand total that agree with the rows', async () => {
    mockRequireApiSession.mockResolvedValue(adminSession)
    const { rows, employeeTotals, grandTotal } = await getProductSalesByEmployee(WINDOW)

    expect(employeeTotals.map((t) => t.ownerName)).toEqual(['Priya Sharma', 'Ravi Menon'])
    expect(employeeTotals[0]).toMatchObject({
      ownerId: 'rep-1',
      productName: 'All products',
      quantity: 15,
      revenue: 2000,
      cost: 1350,
      profit: 650,
    })
    expect(employeeTotals[0].margin).toBeCloseTo(0.325, 10)

    expect(grandTotal.ownerName).toBe(PRODUCT_SALES_TOTAL_OWNER)
    expect(grandTotal).toMatchObject({ quantity: 19, revenue: 2400, cost: 1630, profit: 770 })
    expect(grandTotal.margin).toBeCloseTo(770 / 2400, 10)

    const summed = rows.reduce(
      (acc, r) => ({ quantity: acc.quantity + r.quantity, revenue: acc.revenue + r.revenue, cost: acc.cost + r.cost }),
      { quantity: 0, revenue: 0, cost: 0 }
    )
    expect(summed.quantity).toBe(grandTotal.quantity)
    expect(summed.revenue).toBe(grandTotal.revenue)
    expect(summed.cost).toBe(grandTotal.cost)
  })

  it('restricts a non-manager to their own deals', async () => {
    mockRequireApiSession.mockResolvedValue(repSession)
    const { rows, employeeTotals, grandTotal } = await getProductSalesByEmployee(WINDOW)

    const call = mockDealFindMany.mock.calls[0][0] as unknown as DealArgs
    expect(call.where.ownerId).toBe('rep-1')

    // Ravi's won CarniExAct deal (4 units) is not in Priya's scope.
    expect(rows.map((r) => `${r.ownerName}/${r.productName}`)).toEqual([
      'Priya Sharma/CarniExAct',
      'Priya Sharma/Curcumin - Food Grade',
    ])
    expect(employeeTotals).toHaveLength(1)
    expect(employeeTotals[0]).toMatchObject({ ownerId: 'rep-1', quantity: 15, revenue: 2000, cost: 1350, profit: 650 })
    expect(grandTotal).toMatchObject({ quantity: 15, revenue: 2000, cost: 1350, profit: 650 })
  })

  it('gives a department manager their department only', async () => {
    mockRequireApiSession.mockResolvedValue(managerSession)
    const { employeeTotals } = await getProductSalesByEmployee(WINDOW)

    const call = mockDealFindMany.mock.calls[0][0] as unknown as DealArgs
    expect(call.where.owner).toEqual({ departmentId: 'dept-1' })
    expect(employeeTotals.map((t) => t.ownerName)).toEqual(['Priya Sharma'])
  })

  it('ignores the other tenant even for a full-visibility admin', async () => {
    mockRequireApiSession.mockResolvedValue(adminSession)
    const { rows } = await getProductSalesByEmployee(WINDOW)

    expect(rows.some((r) => r.ownerName === 'Other Tenant Rep')).toBe(false)
    expect(rows.some((r) => r.revenue >= 5000)).toBe(false)
  })

  it('defaults to a 30-day trailing window ending now', async () => {
    mockRequireApiSession.mockResolvedValue(adminSession)
    const before = Date.now()
    await getProductSalesByEmployee()
    const after = Date.now()

    const call = mockDealFindMany.mock.calls[0][0] as unknown as DealArgs
    expect(call.where.closedAt?.lt?.getTime()).toBeGreaterThanOrEqual(before)
    expect(call.where.closedAt?.lt?.getTime()).toBeLessThanOrEqual(after)
    const spanDays =
      (call.where.closedAt!.lt!.getTime() - call.where.closedAt!.gte!.getTime()) / (24 * 60 * 60 * 1000)
    expect(spanDays).toBe(30)
  })

  it('returns a zeroed, NaN-free result when nothing matches', async () => {
    mockRequireApiSession.mockResolvedValue(repSession)
    const { rows, employeeTotals, grandTotal } = await getProductSalesByEmployee({
      from: new Date('2020-01-01T00:00:00.000Z'),
      to: new Date('2020-02-01T00:00:00.000Z'),
    })

    expect(rows).toEqual([])
    expect(employeeTotals).toEqual([])
    expect(grandTotal).toMatchObject({ quantity: 0, revenue: 0, cost: 0, profit: 0, margin: null })
    expect(Number.isNaN(grandTotal.revenue)).toBe(false)
  })

  it('labels a line item whose product row was removed instead of dropping it', async () => {
    mockRequireApiSession.mockResolvedValue(adminSession)
    SEED.push({
      id: 'deal-9',
      organizationId: 'org-1',
      ownerId: 'rep-2',
      ownerName: 'Ravi Menon',
      ownerDepartmentId: 'dept-2',
      stage: 'PAYMENT',
      closedAt: new Date('2026-03-22T09:00:00.000Z'),
      items: [item({ quantity: 1, unitPrice: 50, unitCost: 20 })],
    })
    try {
      const { rows } = await getProductSalesByEmployee(WINDOW)
      expect(rows.some((r) => r.productId === '' && r.productName === 'Unspecified product')).toBe(true)
    } finally {
      SEED.pop()
    }
  })
})