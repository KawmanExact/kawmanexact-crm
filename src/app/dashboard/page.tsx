import { MainLayout } from '@/components/layout'
import { Suspense } from 'react'
import { ForbiddenBanner } from '@/components/dashboard/forbidden-banner'
import { DashboardGate } from '@/components/dashboard/dashboard-gate'
import { KpiCard } from '@/components/dashboard/kpi-card'
import { PipelineCard } from '@/components/dashboard/pipeline-card'
import { AIInsightCard } from '@/components/dashboard/ai-insight-card'
import { FieldActivityCard } from '@/components/dashboard/field-activity-card'
import { LiveMapCard } from '@/components/dashboard/live-map-card'
import { LeadSourceChart } from '@/components/dashboard/lead-source-chart'
import { FollowUpList } from '@/components/dashboard/follow-up-list'
import { RecentActivities } from '@/components/dashboard/recent-activities'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ClipboardCheck } from 'lucide-react'
import { NewActionDropdown } from '@/components/dashboard/new-action-dropdown'
import { ExportMenu } from '@/components/report-engine/export-menu'
import { buildDashboardReport } from '@/lib/report-engine/builders/dashboard'
import { getDashboardMetrics } from '@/services/dashboard.service'
import { VoiceAssistant } from '@/components/voice/voice-assistant'
import { getSession } from '@/lib/session'

export const metadata = {
  title: 'Dashboard | Kawman ExAct',
}

export default async function DashboardPage() {
  const session = await getSession()
  const hasDashboardAccess = ((session?.user.permissions as string[] | undefined) ?? []).includes('dashboard.view')
  if (!hasDashboardAccess) {
    return (
      <MainLayout>
        <div className="space-y-6 animate-in">
          <Suspense fallback={null}>
            <ForbiddenBanner />
          </Suspense>
          <DashboardGate />
        </div>
      </MainLayout>
    )
  }

  const metrics = await getDashboardMetrics()
  const sessionUser = session?.user as unknown as { name?: string; email?: string; organization?: { name?: string } | null } | undefined
  const exportReport = buildDashboardReport({
    metrics,
    generatedBy: sessionUser?.name ?? sessionUser?.email,
    organizationName: sessionUser?.organization?.name ?? undefined,
  })

  return (
    <MainLayout>
      <div className="space-y-6 animate-in">
        <Suspense fallback={null}>
          <ForbiddenBanner />
        </Suspense>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-[20px] sm:text-2xl font-bold text-white flex flex-wrap items-center gap-2 leading-tight">
              Welcome back, {metrics.userName}! <span aria-hidden="true">👋</span>
            </h1>
            <p className="text-white/50 text-sm mt-1">
              Here&apos;s what&apos;s happening in your workspace today.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ExportMenu report={exportReport} />
            <Link href="/dashboard/daily-report">
              <Button variant="outline" className="gap-1.5"><ClipboardCheck className="h-4 w-4" /> Submit today&apos;s report</Button>
            </Link>
            <NewActionDropdown />
          </div>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {metrics.kpis.map((kpi) => (
            <KpiCard key={kpi.id} kpi={kpi} />
          ))}
        </div>

        {/* Pipeline / AI Insights / Field Activity */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <PipelineCard
            stages={metrics.pipeline}
            conversionRate={metrics.conversionRate}
            conversionTrend={metrics.conversionTrend}
          />
          <AIInsightCard summary={metrics.aiSummary} insights={metrics.aiInsights} />
          <div className="space-y-6">
            <FieldActivityCard metrics={metrics.fieldActivity} />
          </div>
        </div>

        {/* Live map */}
        <LiveMapCard markers={metrics.liveVisits} />

        {/* Leads by source / Upcoming follow-ups */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <LeadSourceChart sources={metrics.leadSources} total={metrics.totalLeads} />
          <FollowUpList items={metrics.upcomingFollowUps} />
        </div>

        {/* Recent activities */}
        <RecentActivities items={metrics.recentActivities} />
      </div>
      <VoiceAssistant />
    </MainLayout>
  )
}
