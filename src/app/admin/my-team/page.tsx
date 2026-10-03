import Link from 'next/link'
import { MainLayout } from '@/components/layout'
import { requirePermission } from '@/lib/session'
import { PageHeader } from '@/components/crm/page-header'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { getTeamDashboardMetrics } from '@/services/team.service'
import { listReports, type ReportSummary } from '@/services/ai.service'
import { isAIConfigured } from '@/lib/ai'
import { Users, UserCheck, UserX, ClipboardCheck, Clock } from 'lucide-react'
import { TeamProductivityChart } from './productivity-chart'
import { TeamSummaryPanel } from './team-summary-panel'
import { TeamDateFilter } from './team-date-filter'
import { isOk } from '@/lib/result'

export const metadata = { title: 'My Team | Kawman ExAct' }

function parseDateRange(searchParams: Record<string, string | string[] | undefined>): { from?: Date; to?: Date; preset: string } {
  const rawPreset = typeof searchParams.preset === 'string' ? searchParams.preset : undefined
  const rawFrom = typeof searchParams.from === 'string' ? searchParams.from : undefined
  const rawTo = typeof searchParams.to === 'string' ? searchParams.to : undefined
  if (rawPreset === 'today') {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    const to = new Date(d)
    to.setHours(23, 59, 59, 999)
    return { from: d, to, preset: 'today' }
  }
  if (rawPreset === 'yesterday') {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - 1)
    const to = new Date(d)
    to.setHours(23, 59, 59, 999)
    return { from: d, to, preset: 'yesterday' }
  }
  if (rawPreset === 'week') {
    const to = new Date()
    to.setHours(23, 59, 59, 999)
    const from = new Date()
    from.setHours(0, 0, 0, 0)
    from.setDate(from.getDate() - 6)
    return { from, to, preset: 'week' }
  }
  if (rawPreset === 'month') {
    const to = new Date()
    to.setHours(23, 59, 59, 999)
    const from = new Date()
    from.setHours(0, 0, 0, 0)
    from.setDate(1)
    return { from, to, preset: 'month' }
  }
  if (rawFrom || rawTo) {
    return { from: rawFrom ? new Date(rawFrom) : undefined, to: rawTo ? new Date(rawTo) : undefined, preset: 'custom' }
  }
  // default This Week
  const to = new Date()
  to.setHours(23, 59, 59, 999)
  const from = new Date()
  from.setHours(0, 0, 0, 0)
  from.setDate(from.getDate() - 6)
  return { from, to, preset: 'week' }
}

export default async function MyTeamPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePermission('team.view_all')

  const sp = await searchParams
  const { from, to, preset } = parseDateRange(sp)
  const [metricsResult, aiConfigured, allReports] = await Promise.all([
    getTeamDashboardMetrics(from && to ? { from, to } : undefined),
    Promise.resolve(isAIConfigured()),
    listReports().catch(() => [] as ReportSummary[]),
  ])
  const metrics = isOk(metricsResult) ? metricsResult.data : null
  // Filter to team summaries for the panel
  const teamSummaries = allReports.filter((r) => r.type === 'team_management_summary' || r.type === 'employee_daily_summary').slice(0, 5)

  if (!metricsResult.success) {
    return (
      <MainLayout>
        <div className="space-y-6">
          <PageHeader title="My Team" subtitle="Error loading team data" />
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-300">
            {metricsResult.error}
          </div>
        </div>
      </MainLayout>
    )
  }

  if (!metrics) {
    return (
      <MainLayout>
        <div className="space-y-6">
          <PageHeader title="My Team" subtitle="Error loading team data" />
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-300">
            Unknown error
          </div>
        </div>
      </MainLayout>
    )
  }

  const statCards = [
    { label: 'Total employees', value: metrics.totalEmployees, icon: Users, sub: 'Active in org' },
    { label: 'Online now', value: metrics.onlineEmployees, icon: UserCheck, sub: 'Last 5 min' },
    { label: 'Offline', value: metrics.offlineEmployees, icon: UserX, sub: 'Not seen recently' },
    { label: 'Submitted today', value: metrics.submittedToday, icon: ClipboardCheck, sub: 'Daily reports' },
    { label: 'Pending today', value: metrics.pendingToday, icon: Clock, sub: 'Yet to submit' },
  ]

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader
          title="My Team"
          subtitle="Team overview, activity, and productivity"
          action={<Link href="/dashboard/daily-report"><Button>Submit today&apos;s report</Button></Link>}
        />

        <TeamDateFilter preset={preset} from={from?.toISOString().slice(0, 10)} to={to?.toISOString().slice(0, 10)} />

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {statCards.map((s) => (
            <Card key={s.label} className="p-5 bg-[#0a111c]/80 border-white/[0.08]">
              <div className="h-11 w-11 rounded-xl flex items-center justify-center bg-purple-500/15 text-purple-400">
                <s.icon className="h-5 w-5" />
              </div>
              <p className="text-sm text-white/60 mt-3">{s.label}</p>
              <p className="text-2xl font-bold text-white mt-0.5">{s.value}</p>
              <p className="text-xs text-white/40 mt-1">{s.sub}</p>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <Card className="p-5 bg-[#0a111c]/80 border-white/[0.08] xl:col-span-2">
            <h3 className="text-sm font-medium text-white mb-4">Productivity</h3>
            {metrics.productivity.length === 0 ? (
              <p className="text-sm text-white/40 py-8 text-center">No data in selected range.</p>
            ) : (
              <TeamProductivityChart data={metrics.productivity} />
            )}
          </Card>

          <Card className="p-5 bg-[#0a111c]/80 border-white/[0.08]">
            <h3 className="text-sm font-medium text-white mb-4">Recent activity</h3>
            {metrics.recentActivity.length === 0 ? (
              <p className="text-sm text-white/40">No recent activity.</p>
            ) : (
              <div className="space-y-3">
                {metrics.recentActivity.map((a) => (
                  <div key={a.id} className="flex gap-3 text-sm">
                    <div className="h-8 w-8 rounded-full bg-white/10 flex items-center justify-center text-xs text-white/70 shrink-0">
                      {(a.actorName?.[0] ?? '?').toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-white/80 truncate">{a.description}</p>
                      <p className="text-xs text-white/40">
                        {a.actorName} · {new Date(a.createdAt).toLocaleString('en-IN')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-4">
              <Link href="/admin/my-team/reports" className="text-sm text-purple-400 hover:text-purple-300">View daily reports →</Link>
            </div>
          </Card>
        </div>

        <TeamSummaryPanel aiConfigured={aiConfigured} initialReports={teamSummaries} from={from?.toISOString().slice(0, 10)} to={to?.toISOString().slice(0, 10)} />
      </div>
    </MainLayout>
  )
}
