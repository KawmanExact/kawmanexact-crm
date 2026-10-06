import 'server-only'
import type { Prisma } from '@/generated/prisma'
import { prisma } from '@/lib/db'
import { requireApiSession } from '@/lib/session'
import { ownerScopeWhere } from '@/lib/record-scope-helpers'
import { computeLineTotal, toMoney, toQuantity, zeroMoney, zeroQuantity } from '@/lib/sales-money'
import { productOptionLabel } from '@/types/sales'
import type { PipelineStage, LeadSource } from '@/types/dashboard'

const PIPELINE_COLORS: Record<string, string> = {
  SUSPECT: '#ef4444',
  PROSPECT: '#f97316',
  APPROACH_ANALYSE: '#eab308',
  NEGOTIATE: '#22c55e',
  CLOSE: '#3b82f6',
  ORDER: '#1e40af',
  PAYMENT: '#8b5cf6',
  LOST: '#6b7280',
}
const PIPELINE_LABELS: Record<string, string> = {
  SUSPECT: 'Suspect',
  PROSPECT: 'Prospect',
  APPROACH_ANALYSE: 'Approach & Analyse',
  NEGOTIATE: 'Negotiate',
  CLOSE: 'Close',
  ORDER: 'Order',
  PAYMENT: 'Payment',
  LOST: 'Lost',
}
const SOURCE_COLORS = ['#818cf8', '#38bdf8', '#34d399', '#fb923c', '#f472b6', '#facc15', '#f87171']

function startOfMonth(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}
function monthsAgo(n: number): Date {
  const d = startOfMonth()
  d.setMonth(d.getMonth() - n)
  return d
}
function monthLabel(d: Date): string {
  return d.toLocaleDateString('en-IN', { month: 'short' })
}

export interface CrmDashboardData {
  totals: { leads: number; companies: number; contacts: number; openDeals: number }
  pipeline: PipelineStage[]
  leadSources: LeadSource[]
  totalLeads: number
  winRate: string
  avgDealSize: string
  topCompanies: { id: string; name: string; dealCount: number; dealValue: number }[]
  topDeals: { id: string; name: string; company: string; value: number; stage: string }[]
}

/** Real aggregation queries backing the /crm "CRM Dashboard" page. */
export async function getCrmDashboardData(): Promise<CrmDashboardData> {
  const session = await requireApiSession()
  const organizationId = session.user.organizationId

  const [
    leadsCount,
    companiesCount,
    contactsCount,
    openDealsCount,
    dealsByStage,
    leadSourceRows,
    wonCount,
    lostCount,
    wonAgg,
    topCompaniesRaw,
    topDealsRaw,
  ] = await Promise.all([
    // Enquiries are deals now — the Deal row carries the lead fields, so both
    // "leads" totals and lead-source breakdowns read Deal rather than the
    // pre-merge Lead table.
    prisma.deal.count({ where: { organizationId } }),
    prisma.company.count({ where: { organizationId } }),
    prisma.contact.count({ where: { organizationId } }),
    prisma.deal.count({ where: { organizationId, stage: { notIn: ['PAYMENT', 'LOST'] } } }),
    prisma.deal.groupBy({ by: ['stage'], where: { organizationId }, _count: { _all: true }, _sum: { value: true } }),
    prisma.deal.groupBy({ by: ['source'], where: { organizationId }, _count: { _all: true } }),
    prisma.deal.count({ where: { organizationId, stage: 'PAYMENT' } }),
    prisma.deal.count({ where: { organizationId, stage: 'LOST' } }),
    prisma.deal.aggregate({ where: { organizationId, stage: 'PAYMENT' }, _sum: { value: true }, _count: { _all: true } }),
    prisma.company.findMany({
      where: { organizationId },
      select: {
        id: true,
        name: true,
        deals: { select: { value: true } },
      },
      take: 200,
    }),
    prisma.deal.findMany({
      where: { organizationId, stage: { notIn: ['PAYMENT', 'LOST'] } },
      orderBy: { value: 'desc' },
      take: 5,
      select: { id: true, name: true, value: true, stage: true, company: { select: { name: true } } },
    }),
  ])

  const pipeline: PipelineStage[] = dealsByStage
    .sort((a, b) => Object.keys(PIPELINE_LABELS).indexOf(a.stage) - Object.keys(PIPELINE_LABELS).indexOf(b.stage))
    .map((row) => ({
      id: row.stage,
      name: PIPELINE_LABELS[row.stage] ?? row.stage,
      count: row._count._all,
      value: `₹${Number(row._sum.value ?? 0).toLocaleString('en-IN')}`,
      color: PIPELINE_COLORS[row.stage] ?? '#818cf8',
    }))

  const totalLeadSources = leadSourceRows.reduce((sum, r) => sum + r._count._all, 0) || 1
  const leadSources: LeadSource[] = leadSourceRows
    .sort((a, b) => b._count._all - a._count._all)
    .map((row, i) => ({
      id: row.source ?? 'other',
      name: row.source ?? 'Other',
      count: row._count._all,
      percentage: Math.round((row._count._all / totalLeadSources) * 100),
      color: SOURCE_COLORS[i % SOURCE_COLORS.length],
    }))

  const decidedDeals = wonCount + lostCount
  const winRate = decidedDeals === 0 ? '—' : `${Math.round((wonCount / decidedDeals) * 100)}%`
  const avgDealSize =
    wonAgg._count._all === 0
      ? '₹0'
      : `₹${Math.round(Number(wonAgg._sum.value ?? 0) / wonAgg._count._all).toLocaleString('en-IN')}`

  const topCompanies = topCompaniesRaw
    .map((c) => ({
      id: c.id,
      name: c.name,
      dealCount: c.deals.length,
      dealValue: c.deals.reduce((sum, d) => sum + Number(d.value), 0),
    }))
    .filter((c) => c.dealCount > 0)
    .sort((a, b) => b.dealValue - a.dealValue)
    .slice(0, 5)

  const topDeals = topDealsRaw.map((d) => ({
    id: d.id,
    name: d.name,
    company: d.company?.name ?? '—',
    value: Number(d.value),
    stage: d.stage,
  }))

  return {
    totals: { leads: leadsCount, companies: companiesCount, contacts: contactsCount, openDeals: openDealsCount },
    pipeline,
    leadSources,
    totalLeads: leadsCount,
    winRate,
    avgDealSize,
    topCompanies,
    topDeals,
  }
}

export interface SalesReportData {
  revenueByMonth: { month: string; won: number; lost: number }[]
  totalWonValue: string
  winRate: string
  avgDealSize: string
  dealCount: number
  ownerLeaderboard: { name: string; wonCount: number; wonValue: number }[]
}

const REVENUE_MONTHS = 6

/** Real aggregation queries backing the /reports/sales page. */
export async function getSalesReportData(): Promise<SalesReportData> {
  const session = await requireApiSession()
  const organizationId = session.user.organizationId
  const windowStart = monthsAgo(REVENUE_MONTHS - 1)

  const [closedDeals, wonAgg, wonCount, lostCount, ownerRows] = await Promise.all([
    prisma.deal.findMany({
      where: { organizationId, stage: { in: ['PAYMENT', 'LOST'] }, closedAt: { gte: windowStart } },
      select: { stage: true, value: true, closedAt: true },
    }),
    prisma.deal.aggregate({ where: { organizationId, stage: 'PAYMENT' }, _sum: { value: true }, _count: { _all: true } }),
    prisma.deal.count({ where: { organizationId, stage: 'PAYMENT' } }),
    prisma.deal.count({ where: { organizationId, stage: 'LOST' } }),
    prisma.deal.groupBy({
      by: ['ownerId'],
      where: { organizationId, stage: 'PAYMENT' },
      _count: { _all: true },
      _sum: { value: true },
      orderBy: { _sum: { value: 'desc' } },
      take: 8,
    }),
  ])

  // Bucket won/lost value by month, oldest -> newest.
  const buckets = new Map<string, { won: number; lost: number }>()
  for (let i = REVENUE_MONTHS - 1; i >= 0; i--) {
    const d = monthsAgo(i)
    buckets.set(monthLabel(d), { won: 0, lost: 0 })
  }
  for (const deal of closedDeals) {
    if (!deal.closedAt) continue
    const key = monthLabel(startOfMonth(deal.closedAt))
    const bucket = buckets.get(key)
    if (!bucket) continue
    if (deal.stage === 'PAYMENT') bucket.won += Number(deal.value)
    else bucket.lost += Number(deal.value)
  }
  const revenueByMonth = Array.from(buckets.entries()).map(([month, v]) => ({ month, ...v }))

  const decided = wonCount + lostCount
  const winRate = decided === 0 ? '—' : `${Math.round((wonCount / decided) * 100)}%`
  const avgDealSize =
    wonAgg._count._all === 0
      ? '₹0'
      : `₹${Math.round(Number(wonAgg._sum.value ?? 0) / wonAgg._count._all).toLocaleString('en-IN')}`

  const ownerIds = ownerRows.map((r) => r.ownerId)
  const owners = await prisma.user.findMany({ where: { id: { in: ownerIds } }, select: { id: true, name: true } })
  const ownerName = new Map(owners.map((o) => [o.id, o.name ?? 'Unknown']))

  const ownerLeaderboard = ownerRows.map((row) => ({
    name: ownerName.get(row.ownerId) ?? 'Unknown',
    wonCount: row._count._all,
    wonValue: Number(row._sum.value ?? 0),
  }))

  return {
    revenueByMonth,
    totalWonValue: `₹${Number(wonAgg._sum.value ?? 0).toLocaleString('en-IN')}`,
    winRate,
    avgDealSize,
    dealCount: wonAgg._count._all,
    ownerLeaderboard,
  }
}

// ---------------------------------------------------------------------------
// Product Sales by Employee
// ---------------------------------------------------------------------------
// Reads WON deals closed inside [from, to) and rolls their DealItem line
// numbers up per employee x product. Only won business counts: an open or
// lost deal is not revenue yet, and a won deal's `closedAt` is the only
// trustworthy "when was this booked" stamp.
//
// Scoping is the same two layers every other CRM service uses:
//   1. organizationId  — never cross tenants
//   2. ownerScopeWhere — non-managers only see deals they own themselves
//
// Money and quantity are accumulated as Prisma.Decimal (lib/sales-money),
// never as JS floats: quantities are Decimal(15,3) kg and summing them as
// floats loses the third decimal, which is exactly where a kg-priced
// ingredient sale is rounded.
// ---------------------------------------------------------------------------

/** Window used when the caller does not pass an explicit `from`/`to`. */
export const PRODUCT_SALES_DEFAULT_WINDOW_DAYS = 30

/** Label used for the rollup rows that have no single product / no single owner. */
export const PRODUCT_SALES_TOTAL_PRODUCT = 'All products'
export const PRODUCT_SALES_TOTAL_OWNER = 'All employees'

/** Line items whose product row was deleted (`DealItem.productId` is nullable). */
export const PRODUCT_SALES_UNSPECIFIED_PRODUCT = 'Unspecified product'

export interface ProductSalesByEmployeeRow {
  ownerId: string
  ownerName: string
  productId: string
  productName: string
  quantity: number
  revenue: number
  cost: number
  profit: number
  /** profit / revenue as a fraction (0.35 = 35%), or null when revenue is 0. */
  margin: number | null
}

export interface ProductSalesByEmployeeResult {
  /** One row per employee x product, highest revenue first. */
  rows: ProductSalesByEmployeeRow[]
  /** One row per employee (productId empty), highest revenue first. */
  employeeTotals: Array<ProductSalesByEmployeeRow & { productId?: string }>
  /** Whole-report rollup, so the KPI cards never re-add the rows themselves. */
  grandTotal: ProductSalesByEmployeeRow
}

export interface ProductSalesByEmployeeOptions {
  /** Inclusive lower bound — `deal.closedAt >= from`. Defaults to 30 days back. */
  from?: Date
  /** Exclusive upper bound — `deal.closedAt < to`. Defaults to now. */
  to?: Date
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** Decimal accumulator for one employee x product cell. */
interface ProductSalesCell {
  ownerId: string
  ownerName: string
  productId: string
  productName: string
  quantity: Prisma.Decimal
  revenue: Prisma.Decimal
  cost: Prisma.Decimal
}

/** Margin is a fraction, and an empty cell is a null margin rather than NaN. */
function marginOf(revenue: Prisma.Decimal, profit: Prisma.Decimal): number | null {
  if (revenue.lessThanOrEqualTo(0)) return null
  return profit.div(revenue).toNumber()
}

function emptyCell(ownerId: string, ownerName: string, productId: string, productName: string): ProductSalesCell {
  return { ownerId, ownerName, productId, productName, quantity: zeroQuantity(), revenue: zeroMoney(), cost: zeroMoney() }
}

function cellToRow(cell: ProductSalesCell): ProductSalesByEmployeeRow {
  const revenue = toMoney(cell.revenue)
  const cost = toMoney(cell.cost)
  const profit = toMoney(revenue.minus(cost))
  return {
    ownerId: cell.ownerId,
    ownerName: cell.ownerName,
    productId: cell.productId,
    productName: cell.productName,
    quantity: toQuantity(cell.quantity).toNumber(),
    revenue: revenue.toNumber(),
    cost: cost.toNumber(),
    profit: profit.toNumber(),
    margin: marginOf(revenue, profit),
  }
}

function emptyTotal(ownerName: string): ProductSalesByEmployeeRow {
  return {
    ownerId: '',
    ownerName,
    productId: '',
    productName: PRODUCT_SALES_TOTAL_PRODUCT,
    quantity: 0,
    revenue: 0,
    cost: 0,
    profit: 0,
    margin: null,
  }
}

/** Whole-report rollup, so callers never re-add the rows and risk a rounding drift. */
function grandTotalFrom(cells: Map<string, ProductSalesCell>): ProductSalesByEmployeeRow {
  let quantity = zeroQuantity()
  let revenue = zeroMoney()
  let cost = zeroMoney()
  for (const cell of cells.values()) {
    quantity = quantity.plus(cell.quantity)
    revenue = revenue.plus(cell.revenue)
    cost = cost.plus(cell.cost)
  }
  const revenueTotal = toMoney(revenue)
  const costTotal = toMoney(cost)
  const profitTotal = toMoney(revenueTotal.minus(costTotal))
  return {
    ...emptyTotal(PRODUCT_SALES_TOTAL_OWNER),
    quantity: toQuantity(quantity).toNumber(),
    revenue: revenueTotal.toNumber(),
    cost: costTotal.toNumber(),
    profit: profitTotal.toNumber(),
    margin: marginOf(revenueTotal, profitTotal),
  }
}

/**
 * Product-level sales performance per employee for won deals closed in
 * `[from, to)`.
 *
 * One query pulls the deals with their line items and the product relation;
 * the rollup happens in memory because Decimal math (and the per-product
 * labelling) is not expressible as a Prisma groupBy on a nested relation.
 */
export async function getProductSalesByEmployee(
  opts: ProductSalesByEmployeeOptions = {},
): Promise<ProductSalesByEmployeeResult> {
  const session = await requireApiSession()
  const organizationId = session.user.organizationId
  const to = opts.to ?? new Date()
  const from = opts.from ?? new Date(to.getTime() - PRODUCT_SALES_DEFAULT_WINDOW_DAYS * MS_PER_DAY)

  const deals = await prisma.deal.findMany({
    where: {
      organizationId,
      stage: 'PAYMENT',
      closedAt: { gte: from, lt: to },
      ...ownerScopeWhere<Prisma.DealWhereInput>(session.user),
    },
    select: {
      ownerId: true,
      owner: { select: { name: true } },
      items: {
        select: {
          productId: true,
          quantity: true,
          unitPrice: true,
          unitCost: true,
          product: { select: { name: true, variant: true } },
        },
      },
    },
    orderBy: { closedAt: 'desc' },
  })

  const cells = new Map<string, ProductSalesCell>()
  for (const deal of deals) {
    const ownerName = deal.owner?.name?.trim() || deal.ownerId
    for (const item of deal.items) {
      const productId = item.productId ?? ''
      const productName = item.product
        ? productOptionLabel({ name: item.product.name, variant: item.product.variant })
        : PRODUCT_SALES_UNSPECIFIED_PRODUCT
      const key = `${deal.ownerId}::${productId}`
      const cell = cells.get(key) ?? emptyCell(deal.ownerId, ownerName, productId, productName)
      // Line money is recomputed from quantity x unitPrice/unitCost, exactly as
      // the deal form does, so a hand-edited deal value can never inflate this.
      cell.quantity = cell.quantity.plus(toQuantity(item.quantity))
      cell.revenue = cell.revenue.plus(computeLineTotal(item.quantity, item.unitPrice))
      cell.cost = cell.cost.plus(computeLineTotal(item.quantity, item.unitCost))
      cells.set(key, cell)
    }
  }

  const rows = Array.from(cells.values())
    .map(cellToRow)
    .sort((a, b) => b.revenue - a.revenue || a.ownerName.localeCompare(b.ownerName) || a.productName.localeCompare(b.productName))

  const ownerCells = new Map<string, ProductSalesCell>()
  for (const cell of cells.values()) {
    const total = ownerCells.get(cell.ownerId) ?? emptyCell(cell.ownerId, cell.ownerName, '', PRODUCT_SALES_TOTAL_PRODUCT)
    total.quantity = total.quantity.plus(cell.quantity)
    total.revenue = total.revenue.plus(cell.revenue)
    total.cost = total.cost.plus(cell.cost)
    ownerCells.set(cell.ownerId, total)
  }
  const employeeTotals: ProductSalesByEmployeeResult['employeeTotals'] = Array.from(ownerCells.values())
    .map(cellToRow)
    .sort((a, b) => b.revenue - a.revenue || a.ownerName.localeCompare(b.ownerName))

  return { rows, employeeTotals, grandTotal: grandTotalFrom(cells) }
}
