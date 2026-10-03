import 'server-only'
import { prisma } from '@/lib/db'
import { requireApiSession } from '@/lib/session'
import type { PipelineStage, LeadSource } from '@/types/dashboard'

const PIPELINE_COLORS: Record<string, string> = {
  NEW_LEAD: '#60a5fa',
  CONTACTED: '#38bdf8',
  QUALIFIED: '#34d399',
  PROPOSAL: '#fb923c',
  NEGOTIATION: '#a78bfa',
  WON: '#22c55e',
  LOST: '#ef4444',
}
const PIPELINE_LABELS: Record<string, string> = {
  NEW_LEAD: 'New Leads',
  CONTACTED: 'Contacted',
  QUALIFIED: 'Qualified',
  PROPOSAL: 'Proposal',
  NEGOTIATION: 'Negotiation',
  WON: 'Won',
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
    prisma.lead.count({ where: { organizationId } }),
    prisma.company.count({ where: { organizationId } }),
    prisma.contact.count({ where: { organizationId } }),
    prisma.deal.count({ where: { organizationId, stage: { notIn: ['WON', 'LOST'] } } }),
    prisma.deal.groupBy({ by: ['stage'], where: { organizationId }, _count: { _all: true }, _sum: { value: true } }),
    prisma.lead.groupBy({ by: ['source'], where: { organizationId }, _count: { _all: true } }),
    prisma.deal.count({ where: { organizationId, stage: 'WON' } }),
    prisma.deal.count({ where: { organizationId, stage: 'LOST' } }),
    prisma.deal.aggregate({ where: { organizationId, stage: 'WON' }, _sum: { value: true }, _count: { _all: true } }),
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
      where: { organizationId, stage: { notIn: ['WON', 'LOST'] } },
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
      where: { organizationId, stage: { in: ['WON', 'LOST'] }, closedAt: { gte: windowStart } },
      select: { stage: true, value: true, closedAt: true },
    }),
    prisma.deal.aggregate({ where: { organizationId, stage: 'WON' }, _sum: { value: true }, _count: { _all: true } }),
    prisma.deal.count({ where: { organizationId, stage: 'WON' } }),
    prisma.deal.count({ where: { organizationId, stage: 'LOST' } }),
    prisma.deal.groupBy({
      by: ['ownerId'],
      where: { organizationId, stage: 'WON' },
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
    if (deal.stage === 'WON') bucket.won += Number(deal.value)
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
