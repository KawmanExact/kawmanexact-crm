import 'server-only'
import { prisma } from '@/lib/db'
import { requireSession } from '@/lib/session'
import type { DashboardMetrics, RecentActivity, LiveVisitMarker } from '@/types/dashboard'
import { logger } from '@/lib/logger'

const SPARKLINE_DAYS = 12
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
const LEAD_SOURCE_COLORS = ['#818cf8', '#38bdf8', '#34d399', '#fb923c', '#f472b6', '#facc15', '#f87171']
const ACTIVITY_ICON: Record<string, RecentActivity['icon']> = {
  CHECK_IN: 'checkin',
  MEETING_COMPLETED: 'meeting',
  MOM_GENERATED: 'mom',
  LEAD_CREATED: 'lead',
  DEAL_WON: 'deal',
  DEAL_UPDATED: 'deal',
}
const ACTIVITY_COLOR: Record<string, RecentActivity['color']> = {
  CHECK_IN: 'green',
  MEETING_COMPLETED: 'purple',
  MOM_GENERATED: 'orange',
  LEAD_CREATED: 'blue',
  DEAL_WON: 'green',
  DEAL_UPDATED: 'pink',
}

function startOfDay(d = new Date()): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}
function daysAgo(n: number): Date {
  const d = startOfDay()
  d.setDate(d.getDate() - n)
  return d
}

/** Buckets a list of dates into `days` daily counts, oldest -> newest, ending today. */
function bucketCounts(dates: Date[], days = SPARKLINE_DAYS): number[] {
  const buckets = new Array(days).fill(0)
  const today = startOfDay()
  for (const date of dates) {
    const day = startOfDay(date)
    const diff = Math.round((today.getTime() - day.getTime()) / 86_400_000)
    const idx = days - 1 - diff
    if (idx >= 0 && idx < days) buckets[idx] += 1
  }
  return buckets
}

/** Same, but sums a numeric value per bucket instead of counting rows. */
function bucketSums(rows: { date: Date; amount: number }[], days = SPARKLINE_DAYS): number[] {
  const buckets = new Array(days).fill(0)
  const today = startOfDay()
  for (const row of rows) {
    const day = startOfDay(row.date)
    const diff = Math.round((today.getTime() - day.getTime()) / 86_400_000)
    const idx = days - 1 - diff
    if (idx >= 0 && idx < days) buckets[idx] += row.amount
  }
  return buckets
}

function pctChange(bucket: number[]): { label: string; direction: 'up' | 'down' } {
  const half = Math.floor(bucket.length / 2)
  const first = bucket.slice(0, half).reduce((a, b) => a + b, 0)
  const second = bucket.slice(half).reduce((a, b) => a + b, 0)
  if (first === 0 && second === 0) return { label: 'No change', direction: 'up' }
  if (first === 0) return { label: 'New activity', direction: 'up' }
  const change = Math.round(((second - first) / first) * 100)
  return { label: (change >= 0 ? '+' : '') + change + '% this period', direction: change >= 0 ? 'up' : 'down' }
}

function initials(name: string): string {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
}

export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const session = await requireSession()
  const organizationId = session.user.organizationId
  const today = startOfDay()
  const tomorrow = daysAgo(-1)
  const windowStart = daysAgo(SPARKLINE_DAYS - 1)
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)

  // Neon pooled endpoint has limited connections — firing 20 parallel queries
  // against a 10-connection pool causes ETIMEDOUTs that surface as
  // PrismaClientKnownRequestError {code: ETIMEDOUT} and AggregateError
  // "object null is not iterable" (see client.js:15). Batch in groups and
  // degrade gracefully so one slow query never crashes the whole dashboard.
  function safe<T>(p: Promise<T>, fallback: unknown): Promise<T> {
    return p.catch((err) => {
      logger.error('dashboard query failed, using fallback', {}, err as Error)
      return fallback as T
    })
  }

  const [
    totalLeadsCount,
    activeDealsCount,
    todaysVisitsCount,
    followUpsDueCount,
    wonDealsThisMonth,
  ] = await Promise.all([
    safe(prisma.lead.count({ where: { organizationId } }), 0),
    safe(prisma.deal.count({ where: { organizationId, stage: { notIn: ['WON', 'LOST'] } } }), 0),
    safe(prisma.fieldVisit.count({ where: { organizationId, scheduledAt: { gte: today, lt: tomorrow } } }), 0),
    safe(prisma.followUp.count({ where: { organizationId, status: { in: ['PENDING', 'OVERDUE'] }, dueDate: { lt: tomorrow } } }), 0),
    safe(prisma.deal.aggregate({ where: { organizationId, stage: 'WON', closedAt: { gte: monthStart } }, _sum: { value: true } }), { _sum: { value: null } } as unknown as Awaited<ReturnType<typeof prisma.deal.aggregate>>),
  ])

  const [
    leadDates,
    dealDates,
    visitDates,
    followUpDates,
    dealsByStage,
    leadsBySourceUnused,
  ] = await Promise.all([
    safe(prisma.lead.findMany({ where: { organizationId, createdAt: { gte: windowStart } }, select: { createdAt: true } }), [] as { createdAt: Date }[]),
    safe(prisma.deal.findMany({ where: { organizationId, createdAt: { gte: windowStart } }, select: { createdAt: true } }), [] as { createdAt: Date }[]),
    safe(prisma.fieldVisit.findMany({ where: { organizationId, scheduledAt: { gte: windowStart } }, select: { scheduledAt: true } }), [] as { scheduledAt: Date }[]),
    safe(prisma.followUp.findMany({ where: { organizationId, createdAt: { gte: windowStart } }, select: { createdAt: true } }), [] as { createdAt: Date }[]),
    safe(prisma.deal.groupBy({ by: ['stage'], where: { organizationId }, _count: { _all: true }, _sum: { value: true } }), [] as unknown as Awaited<ReturnType<typeof prisma.deal.groupBy>>),
    safe(prisma.lead.groupBy({ by: ['source'], where: { organizationId }, _count: { _all: true } }), [] as unknown as Awaited<ReturnType<typeof prisma.lead.groupBy>>),
  ])
  void leadsBySourceUnused

  const [
    checkedInToday,
    inMeetingNow,
    geoVerifiedToday,
    momsToday,
    activeVisitsToday,
    leadSourceRows,
    upcomingFollowUps,
    recentActivities,
    fileSizeAgg,
  ] = await Promise.all([
    safe(prisma.checkIn.count({ where: { visit: { organizationId }, createdAt: { gte: today, lt: tomorrow } } }), 0),
    safe(prisma.fieldVisit.count({ where: { organizationId, status: 'IN_MEETING' } }), 0),
    safe(prisma.checkIn.count({ where: { visit: { organizationId }, createdAt: { gte: today, lt: tomorrow }, verificationStatus: 'VERIFIED' } }), 0),
    safe(prisma.meetingSummary.count({ where: { meeting: { organizationId }, createdAt: { gte: today, lt: tomorrow } } }), 0),
    safe(
      prisma.fieldVisit.findMany({
        where: { organizationId, scheduledAt: { gte: today, lt: tomorrow }, status: { notIn: ['CANCELLED'] } },
        select: { id: true, status: true, latitude: true, longitude: true, assignee: { select: { name: true } } },
        take: 20,
      }),
      [] as unknown as Awaited<ReturnType<typeof prisma.fieldVisit.findMany>>,
    ),
    safe(prisma.lead.groupBy({ by: ['source'], where: { organizationId }, _count: { _all: true } }), [] as unknown as Awaited<ReturnType<typeof prisma.lead.groupBy>>),
    safe(
      prisma.followUp.findMany({
        where: { organizationId, status: 'PENDING' },
        orderBy: { dueDate: 'asc' },
        take: 4,
        include: { owner: { select: { name: true } }, company: { select: { name: true } }, lead: { select: { company: true } }, deal: { include: { company: { select: { name: true } } } } },
      }),
      [] as unknown as Awaited<ReturnType<typeof prisma.followUp.findMany>>,
    ),
    safe(
      prisma.activity.findMany({ where: { organizationId }, orderBy: { createdAt: 'desc' }, take: 6, include: { actor: { select: { name: true } }, lead: true, company: true, deal: true } }),
      [] as unknown as Awaited<ReturnType<typeof prisma.activity.findMany>>,
    ),
    safe(prisma.file.aggregate({ where: { organizationId }, _sum: { fileSize: true } }), { _sum: { fileSize: null } } as unknown as Awaited<ReturnType<typeof prisma.file.aggregate>>),
  ])

  const leadTrend = bucketCounts(leadDates.map((r) => r.createdAt))
  const dealTrend = bucketCounts(dealDates.map((r) => r.createdAt))
  const visitTrend = bucketCounts(visitDates.map((r) => r.scheduledAt))
  const followUpTrend = bucketCounts(followUpDates.map((r) => r.createdAt))

  // Won-value trend needs the raw rows (already summed above for the KPI number).
  const wonDealRows = await prisma.deal
    .findMany({ where: { organizationId, stage: 'WON', closedAt: { gte: windowStart } }, select: { closedAt: true, value: true } })
    .catch((err) => {
      logger.error('wonTrend query failed', {}, err as Error)
      return [] as { closedAt: Date | null; value: unknown }[]
    })
  const wonTrend = bucketSums(
    wonDealRows.filter((r) => r.closedAt).map((r) => ({ date: r.closedAt as Date, amount: Number(r.value) }))
  )

  const wonValue = wonDealsThisMonth._sum.value ? Number(wonDealsThisMonth._sum.value) : 0

  const totalLeadSources = leadSourceRows.reduce((sum, r) => sum + r._count._all, 0) || 1

  // --- Live visits: normalize today's field-visit coordinates into a 0-100
  // percentage box for the illustrative map card (no real map tiles yet).
  const geoVisits = activeVisitsToday.filter((v) => v.latitude != null && v.longitude != null)
  const STATUS_LABEL: Record<string, LiveVisitMarker['status']> = {
    IN_MEETING: 'In Meeting',
    CHECKED_IN: 'Checked-in',
    ON_THE_WAY: 'On the way',
    COMPLETED: 'Checked-out',
    SCHEDULED: 'On the way',
  }
  const liveVisits: LiveVisitMarker[] = geoVisits.map((v) => ({
    id: v.id,
    name: v.assignee.name ?? 'Field rep',
    status: STATUS_LABEL[v.status] ?? 'On the way',
    latitude: Number(v.latitude),
    longitude: Number(v.longitude),
  }))

  // --- AI insights: deterministic, computed straight from the org's own
  // data (no external AI call unless an AI provider key is configured —
  // see services/ai.service.ts for that upgrade path).
  const [highPriorityLeadsCount, stuckDeals, topOpenDeal, meetingsCompletedToday, followUpsDueTodayCount] =
    await Promise.all([
      prisma.lead.count({ where: { organizationId, score: { gte: 80 }, status: { notIn: ['WON', 'LOST'] } } }).catch(() => 0),
      prisma.deal.count({ where: { organizationId, stage: 'NEGOTIATION', updatedAt: { lt: daysAgo(15) } } }).catch(() => 0),
      prisma.deal.findFirst({ where: { organizationId, stage: { notIn: ['WON', 'LOST'] } }, orderBy: { value: 'desc' }, include: { company: { select: { name: true } } } }).catch(() => null),
      prisma.meeting.count({ where: { organizationId, status: 'COMPLETED', updatedAt: { gte: today, lt: tomorrow } } }).catch(() => 0),
      prisma.followUp.count({ where: { organizationId, status: 'PENDING', dueDate: { gte: today, lt: tomorrow } } }).catch(() => 0),
    ])

  return {
    userName: session.user.name?.split(' ')[0] ?? 'there',

    kpis: [
      {
        id: 'total-leads',
        label: 'Total Leads',
        value: String(totalLeadsCount),
        rawValue: totalLeadsCount,
        trendLabel: pctChange(leadTrend).label,
        trendDirection: pctChange(leadTrend).direction,
        sparkline: leadTrend,
        icon: 'leads',
      },
      {
        id: 'active-deals',
        label: 'Active Deals',
        value: String(activeDealsCount),
        rawValue: activeDealsCount,
        trendLabel: pctChange(dealTrend).label,
        trendDirection: pctChange(dealTrend).direction,
        sparkline: dealTrend,
        icon: 'deals',
      },
      {
        id: 'todays-visits',
        label: "Today's Visits",
        value: String(todaysVisitsCount),
        rawValue: todaysVisitsCount,
        trendLabel: pctChange(visitTrend).label,
        trendDirection: pctChange(visitTrend).direction,
        sparkline: visitTrend,
        icon: 'visits',
      },
      {
        id: 'followups-due',
        label: 'Follow-ups Due',
        value: String(followUpsDueCount),
        rawValue: followUpsDueCount,
        trendLabel: pctChange(followUpTrend).label,
        trendDirection: pctChange(followUpTrend).direction,
        sparkline: followUpTrend,
        icon: 'followups',
      },
      {
        id: 'won-deals',
        label: 'Won Deals (This Month)',
        value: formatCompactCurrency(wonValue),
        rawValue: wonValue,
        trendLabel: pctChange(wonTrend).label,
        trendDirection: pctChange(wonTrend).direction,
        sparkline: wonTrend,
        icon: 'won',
      },
    ],

    pipeline: dealsByStage
      .sort((a, b) => Object.keys(PIPELINE_LABELS).indexOf(a.stage) - Object.keys(PIPELINE_LABELS).indexOf(b.stage))
      .map((row) => ({
        id: row.stage.toLowerCase().replace(/_/g, '-'),
        name: PIPELINE_LABELS[row.stage] ?? row.stage,
        count: row._count._all,
        value: formatCompactCurrency(row._sum.value ? Number(row._sum.value) : 0),
        color: PIPELINE_COLORS[row.stage] ?? '#94a3b8',
      })),
    conversionRate: (() => {
      const won = dealsByStage.find((d) => d.stage === 'WON')?._count._all ?? 0
      const total = dealsByStage.reduce((sum, d) => sum + d._count._all, 0)
      return total ? ((won / total) * 100).toFixed(1) + '%' : '0%'
    })(),
    conversionTrend: 'of all deals in pipeline',

    aiSummary: {
      title: 'Workspace Insight',
      description:
        followUpsDueTodayCount > 0
          ? followUpsDueTodayCount + ' follow-up' + (followUpsDueTodayCount === 1 ? '' : 's') + ' due today.' + (topOpenDeal ? ' ' + (topOpenDeal.company?.name ?? '—') + ' is your highest-value open opportunity.' : '')
          : topOpenDeal
            ? 'No follow-ups due today. ' + (topOpenDeal.company?.name ?? '—') + ' is your highest-value open opportunity.'
            : 'No follow-ups due today. Add some leads and deals to see insights here.',
    },
    aiInsights: [
      {
        id: 'high-priority',
        icon: 'flame',
        title: 'High Priority Leads',
        description: highPriorityLeadsCount + ' lead' + (highPriorityLeadsCount === 1 ? '' : 's') + ' scoring 80+',
      },
      {
        id: 'stuck-pipeline',
        icon: 'clock',
        title: 'Stuck in Pipeline',
        description: stuckDeals + ' deal' + (stuckDeals === 1 ? '' : 's') + ' stuck in negotiation > 15 days',
      },
      {
        id: 'best-product',
        icon: 'trend',
        title: 'Top Open Opportunity',
        description: topOpenDeal ? topOpenDeal.name + ' — ' + formatCompactCurrency(Number(topOpenDeal.value)) : 'No open deals yet',
      },
      {
        id: 'meeting-summary',
        icon: 'meeting',
        title: 'Meeting Summary',
        description: meetingsCompletedToday + ' meeting' + (meetingsCompletedToday === 1 ? '' : 's') + ' completed today',
      },
    ],

    fieldActivity: [
      { id: 'checked-in', label: 'Checked-in', value: checkedInToday, sublabel: 'Salespersons', icon: 'checkin', color: 'green' },
      { id: 'in-meetings', label: 'In Meetings', value: inMeetingNow, sublabel: 'Right now', icon: 'meeting', color: 'purple' },
      { id: 'geo-verified', label: 'Geo-Verified Visits', value: geoVerifiedToday, sublabel: 'Today', icon: 'geo', color: 'blue' },
      { id: 'moms-generated', label: 'MoMs Generated', value: momsToday, sublabel: 'Today', icon: 'mom', color: 'orange' },
    ],

    liveVisits,

    totalLeads: totalLeadsCount,
    leadSources: leadSourceRows
      .sort((a, b) => b._count._all - a._count._all)
      .map((row, i) => ({
        id: (row.source ?? 'other').toLowerCase().replace(/\s+/g, '-'),
        name: row.source ?? 'Other',
        count: row._count._all,
        percentage: Math.round((row._count._all / totalLeadSources) * 100),
        color: LEAD_SOURCE_COLORS[i % LEAD_SOURCE_COLORS.length],
      })),

    upcomingFollowUps: upcomingFollowUps.map((f) => ({
      id: f.id,
      company: f.company?.name ?? f.deal?.company?.name ?? f.lead?.company ?? '—',
      purpose: f.title,
      dateLabel: formatDueDateLabel(f.dueDate),
      timeLabel: f.dueDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      assigneeInitials: initials(f.owner.name ?? 'U'),
      assigneeName: f.owner.name ?? 'Unassigned',
    })),

    recentActivities: recentActivities.map((a) => ({
      id: a.id,
      icon: ACTIVITY_ICON[a.type] ?? 'lead',
      color: ACTIVITY_COLOR[a.type] ?? 'blue',
      description: a.description,
      timeLabel: a.createdAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
    })),

    storage: {
      usedGb: Number((Number(fileSizeAgg._sum.fileSize ?? 0) / 1024 ** 3).toFixed(2)),
      totalGb: 100,
    },
  }
}

function formatCompactCurrency(amount: number): string {
  if (amount >= 10_000_000) return '₹' + (amount / 10_000_000).toFixed(1) + 'Cr'
  if (amount >= 100_000) return '₹' + (amount / 100_000).toFixed(1) + 'L'
  if (amount >= 1_000) return '₹' + (amount / 1_000).toFixed(1) + 'K'
  return '₹' + amount
}

function formatDueDateLabel(date: Date): string {
  const today = startOfDay()
  const target = startOfDay(date)
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86_400_000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Tomorrow'
  if (diffDays < 0) return 'Overdue'
  return date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
}
