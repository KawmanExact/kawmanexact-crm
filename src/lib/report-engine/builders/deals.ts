import type { UniversalReportDefinition, ReportColumn } from '../types'
import type { Deal } from '@/types/crm'

const COLUMNS: ReportColumn[] = [
  { key: 'name', header: 'Deal' },
  { key: 'company', header: 'Company' },
  { key: 'contact', header: 'Contact' },
  { key: 'value', header: 'Value', align: 'right', format: 'currency' },
  { key: 'probability', header: 'Probability', align: 'right', format: 'percent' },
  { key: 'stage', header: 'Stage' },
  { key: 'owner', header: 'Owner' },
  { key: 'priority', header: 'Priority' },
  { key: 'expectedClose', header: 'Expected Close', format: 'date' },
]

export function buildDealsReport(opts: {
  deals: Deal[]
  generatedBy?: string
  organizationName?: string
  filters?: Record<string, string>
}): UniversalReportDefinition {
  return {
    name: 'Deals-Pipeline',
    title: 'Deals & Pipeline Report',
    subtitle: `${opts.deals.length} deals — drag-and-drop kanban snapshot`,
    filters: opts.filters,
    metadata: {
      generatedAt: new Date().toISOString(),
      generatedBy: opts.generatedBy,
      organizationName: opts.organizationName,
      recordCount: opts.deals.length,
    },
    columns: COLUMNS,
    rows: opts.deals as unknown as Record<string, unknown>[],
  }
}

export { COLUMNS as DEALS_COLUMNS }
