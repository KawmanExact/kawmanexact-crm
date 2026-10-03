import type { UniversalReportDefinition, ReportMetric } from '../types'
import type { SalesReportData } from '@/services/crm-reports.service'

export function buildSalesReport(opts: {
  data: SalesReportData
  generatedBy?: string
  organizationName?: string
}): UniversalReportDefinition {
  const d = opts.data
  const metrics: ReportMetric[] = [
    { label: 'TOTAL REVENUE WON', value: d.totalWonValue, tone: 'success' },
    { label: 'WIN RATE', value: d.winRate, tone: d.winRate === '—' ? 'default' : 'info' },
    { label: 'AVG. DEAL SIZE', value: d.avgDealSize, tone: 'default' },
    { label: 'DEALS WON', value: String(d.dealCount), tone: 'default' },
  ]

  return {
    name: 'Sales-Report',
    title: 'Sales Performance Report',
    subtitle: 'Revenue, win rate, and rep performance from your live pipeline',
    metadata: {
      generatedAt: new Date().toISOString(),
      generatedBy: opts.generatedBy,
      organizationName: opts.organizationName,
      recordCount: d.dealCount,
    },
    metrics,
    charts: [
      {
        title: 'Revenue by Month',
        subtitle: 'Won vs lost — last 6 months',
        type: 'bar',
        data: d.revenueByMonth as unknown as Record<string, unknown>[],
        xKey: 'month',
        series: [
          { key: 'won', label: 'Won', color: '#059669' },
          { key: 'lost', label: 'Lost', color: '#e2e8f0' },
        ],
        currencyKeys: ['won', 'lost'],
      },
    ],
    tables: [
      {
        title: 'Rep Leaderboard — Won Deals',
        columns: [
          { key: 'name', header: 'Rep' },
          { key: 'wonCount', header: 'Deals Won', align: 'right', format: 'number' },
          { key: 'wonValue', header: 'Revenue', align: 'right', format: 'currency' },
        ],
        rows: d.ownerLeaderboard as unknown as Record<string, unknown>[],
        emptyMessage: 'No won deals yet.',
      },
    ],
  }
}
