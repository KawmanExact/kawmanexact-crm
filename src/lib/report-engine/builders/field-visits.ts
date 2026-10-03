import type { UniversalReportDefinition } from '../types'

export interface VisitReportRow {
  visitTitle: string
  companyName?: string | null
  createdBy: string
  createdAt: string
  purpose: string
  discussion?: string | null
  requirements?: string | null
  competitorInfo?: string | null
  customerFeedback?: string | null
  nextSteps?: string | null
}

export function buildFieldVisitReportsReport(opts: {
  reports: VisitReportRow[]
  generatedBy?: string
  organizationName?: string
}): UniversalReportDefinition {
  return {
    name: 'Field-Visit-Reports',
    title: 'Field Visit Reports',
    subtitle: `${opts.reports.length} reports submitted — grounded in field activity`,
    metadata: {
      generatedAt: new Date().toISOString(),
      generatedBy: opts.generatedBy,
      organizationName: opts.organizationName,
      recordCount: opts.reports.length,
    },
    tables: [
      {
        title: 'Visit Reports',
        columns: [
          { key: 'visitTitle', header: 'Visit' },
          { key: 'companyName', header: 'Company' },
          { key: 'createdBy', header: 'Submitted By' },
          { key: 'createdAt', header: 'Date', format: 'date' },
          { key: 'purpose', header: 'Purpose' },
          { key: 'discussion', header: 'Discussion' },
          { key: 'requirements', header: 'Requirements' },
          { key: 'nextSteps', header: 'Next Steps' },
        ],
        rows: opts.reports as unknown as Record<string, unknown>[],
        emptyMessage: 'No visit reports submitted yet.',
      },
    ],
  }
}
