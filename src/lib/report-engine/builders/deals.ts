import type { UniversalReportDefinition, ReportColumn } from '../types'
import type { Deal } from '@/types/crm'

const COLUMNS: ReportColumn[] = [
  { key: 'name', header: 'Deal Name', width: 28 },
  { key: 'company', header: 'Company', width: 24 },
  { key: 'contactPerson', header: 'Contact Person', width: 18 },
  { key: 'contact', header: 'Contact', width: 18 },
  { key: 'designation', header: 'Designation', width: 16 },
  { key: 'email', header: 'Email', width: 28 },
  { key: 'phone', header: 'Phone', width: 16 },
  { key: 'source', header: 'Source', width: 14 },
  { key: 'grade', header: 'Grade', width: 10 },
  { key: 'application', header: 'Application', width: 16 },
  { key: 'stage', header: 'Stage', width: 14 },
  { key: 'priority', header: 'Priority', width: 12 },
  { key: 'value', header: 'Value', align: 'right', format: 'currency', width: 14 },
  { key: 'probability', header: 'Probability', align: 'right', format: 'percent', width: 12 },
  { key: 'expectedClose', header: 'Expected Close', format: 'date', width: 14 },
  { key: 'nextFollowUp', header: 'Next Follow-up', format: 'date', width: 14 },
  { key: 'city', header: 'City', width: 16 },
  { key: 'country', header: 'Country', width: 16 },
  { key: 'pinCode', header: 'Pin Code', width: 12 },
  { key: 'productsDiscussed', header: 'Products Discussed', width: 28 },
  { key: 'customProductNames', header: 'Custom Products', width: 24 },
  { key: 'keyDiscussion', header: 'Key Discussion Points', width: 28 },
  { key: 'requirement', header: 'Customer Requirement', width: 28 },
  { key: 'cdaStatus', header: 'CDA Status', width: 12 },
  { key: 'samplingStatus', header: 'Sampling Status', width: 14 },
  { key: 'rdFeedback', header: 'R&D Feedback', width: 14 },
  { key: 'loaStatus', header: 'LOA Status', width: 12 },
  { key: 'remark', header: 'Remark', width: 24 },
  { key: 'paymentStatus', header: 'Payment Status', width: 14 },
  { key: 'owner', header: 'Owner', width: 16 },
  { key: 'lastActivityAt', header: 'Last Activity', format: 'date', width: 14 },
  { key: 'createdAt', header: 'Created At', format: 'datetime', width: 16 },
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
    subtitle: `${opts.deals.length} deals — full export`,
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
