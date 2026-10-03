import type { UniversalReportDefinition, ReportMetric } from '../types'
import type { CrmDashboardData } from '@/services/crm-reports.service'

export function buildCrmDashboardReport(opts: {
  data: CrmDashboardData
  generatedBy?: string
  organizationName?: string
}): UniversalReportDefinition {
  const d = opts.data
  const metrics: ReportMetric[] = [
    { label: 'LEADS', value: String(d.totals.leads) },
    { label: 'COMPANIES', value: String(d.totals.companies) },
    { label: 'CONTACTS', value: String(d.totals.contacts) },
    { label: 'OPEN DEALS', value: String(d.totals.openDeals) },
    { label: 'WIN RATE', value: d.winRate, tone: 'success' },
    { label: 'AVG. WON DEAL', value: d.avgDealSize, tone: 'info' },
  ]

  return {
    name: 'CRM-Dashboard',
    title: 'CRM Dashboard Report',
    subtitle: 'Leads, companies, contacts, and pipeline — single-view snapshot',
    metadata: {
      generatedAt: new Date().toISOString(),
      generatedBy: opts.generatedBy,
      organizationName: opts.organizationName,
    },
    metrics,
    charts: [
      {
        title: 'Pipeline by Stage',
        type: 'bar',
        data: d.pipeline.map((s) => ({ stage: s.name, count: s.count })) as unknown as Record<string, unknown>[],
        xKey: 'stage',
        series: [{ key: 'count', label: 'Deals' }],
      },
      {
        title: 'Leads by Source',
        type: 'donut',
        data: d.leadSources.map((s) => ({ source: s.name, count: s.count })) as unknown as Record<string, unknown>[],
        xKey: 'source',
        series: [{ key: 'count', label: 'Leads' }],
      },
    ],
    tables: [
      {
        title: 'Top Companies by Deal Value',
        columns: [
          { key: 'name', header: 'Company' },
          { key: 'dealCount', header: 'Deals', align: 'right', format: 'number' },
          { key: 'dealValue', header: 'Deal Value', align: 'right', format: 'currency' },
        ],
        rows: d.topCompanies as unknown as Record<string, unknown>[],
        emptyMessage: 'No deals yet.',
      },
      {
        title: 'Biggest Open Deals',
        columns: [
          { key: 'name', header: 'Deal' },
          { key: 'company', header: 'Company' },
          { key: 'value', header: 'Value', align: 'right', format: 'currency' },
          { key: 'stage', header: 'Stage' },
        ],
        rows: d.topDeals as unknown as Record<string, unknown>[],
        emptyMessage: 'No open deals.',
      },
    ],
  }
}
