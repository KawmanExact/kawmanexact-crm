import type { UniversalReportDefinition, ReportMetric } from '../types'
import type { DashboardMetrics } from '@/types/dashboard'

export function buildDashboardReport(opts: {
  metrics: DashboardMetrics
  generatedBy?: string
  organizationName?: string
}): UniversalReportDefinition {
  const m = opts.metrics

  const kpiMetrics: ReportMetric[] = m.kpis.map((k) => ({
    label: k.label.toUpperCase(),
    value: k.value,
    sublabel: k.trendLabel,
    trend: { value: k.trendLabel, direction: k.trendDirection },
    tone: k.trendDirection === 'up' ? 'success' as const : 'default' as const,
  }))

  return {
    name: 'Executive-Dashboard',
    title: 'Executive Dashboard Report',
    subtitle: `Welcome back, ${m.userName} — workspace snapshot`,
    periodLabel: `Generated ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`,
    metadata: {
      generatedAt: new Date().toISOString(),
      generatedBy: opts.generatedBy ?? m.userName,
      organizationName: opts.organizationName,
      recordCount: m.totalLeads,
    },
    metrics: kpiMetrics,
    charts: [
      {
        title: 'Pipeline by Stage',
        type: 'bar',
        data: m.pipeline.map((s) => ({ stage: s.name, count: s.count })) as unknown as Record<string, unknown>[],
        xKey: 'stage',
        series: [{ key: 'count', label: 'Deals' }],
      },
      {
        title: 'Leads by Source',
        type: 'donut',
        data: m.leadSources.map((s) => ({ source: s.name, count: s.count })) as unknown as Record<string, unknown>[],
        xKey: 'source',
        series: [{ key: 'count', label: 'Leads' }],
      },
    ],
    insights: m.aiInsights.map((ins) => ({
      title: ins.title,
      description: ins.description,
      variant: (ins.icon === 'flame' ? 'warning' : ins.icon === 'clock' ? 'info' : ins.icon === 'trend' ? 'success' : 'highlight') as never,
    })),
    tables: [
      {
        title: 'Upcoming Follow-ups',
        columns: [
          { key: 'company', header: 'Company' },
          { key: 'purpose', header: 'Purpose' },
          { key: 'dateLabel', header: 'Date' },
          { key: 'timeLabel', header: 'Time' },
          { key: 'assigneeName', header: 'Assignee' },
        ],
        rows: m.upcomingFollowUps as unknown as Record<string, unknown>[],
        emptyMessage: 'No upcoming follow-ups.',
      },
      {
        title: 'Recent Activities',
        columns: [
          { key: 'description', header: 'Activity' },
          { key: 'timeLabel', header: 'When' },
        ],
        rows: m.recentActivities as unknown as Record<string, unknown>[],
        emptyMessage: 'No recent activities.',
      },
    ],
  }
}
