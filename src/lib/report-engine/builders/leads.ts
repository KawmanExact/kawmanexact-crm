import type { UniversalReportDefinition, ReportColumn } from '../types'
import type { Lead } from '@/types/crm'

const COLUMNS: ReportColumn[] = [
  { key: 'name', header: 'Name' },
  { key: 'company', header: 'Company' },
  { key: 'contactPerson', header: 'Contact Person' },
  { key: 'designation', header: 'Designation' },
  { key: 'email', header: 'Email' },
  { key: 'phone', header: 'Phone' },
  { key: 'source', header: 'Source' },
  { key: 'grade', header: 'Grade' },
  { key: 'segment', header: 'Segment' },
  { key: 'status', header: 'Status' },
  { key: 'location', header: 'Location' },
  { key: 'region', header: 'Region' },
  { key: 'meetingDate', header: 'Meeting Date', format: 'date' },
  { key: 'meetingAt', header: 'Meeting At' },
  { key: 'productsDiscussed', header: 'Products Discussed', csvText: true },
  { key: 'keyDiscussion', header: 'Key Discussion' },
  { key: 'requirement', header: 'Requirement' },
  { key: 'cdaStatus', header: 'CDA Status' },
  { key: 'samplingStatus', header: 'Sampling Status' },
  { key: 'rdFeedback', header: 'R&D Feedback' },
  { key: 'remark', header: 'Remark' },
  { key: 'nextFollowUp', header: 'Next Follow-up', format: 'date' },
  { key: 'loaStatus', header: 'LOA Status' },
  { key: 'purposeOfVisit', header: 'Purpose of Visit' },
  { key: 'score', header: 'Score', align: 'right', format: 'number' },
  { key: 'value', header: 'Value', align: 'right', format: 'currency' },
  { key: 'owner', header: 'Owner' },
  { key: 'lastActivityAt', header: 'Last Activity', format: 'date' },
  { key: 'createdAt', header: 'Created At', format: 'date' },
]

export function buildLeadsReport(opts: {
  leads: Lead[]
  generatedBy?: string
  organizationName?: string
  filters?: Record<string, string>
}): UniversalReportDefinition {
  return {
    name: 'Leads',
    title: 'Leads Report',
    subtitle: `${opts.leads.length} leads — scoped to your organization and permissions`,
    filters: opts.filters,
    metadata: {
      generatedAt: new Date().toISOString(),
      generatedBy: opts.generatedBy,
      organizationName: opts.organizationName,
      recordCount: opts.leads.length,
    },
    columns: COLUMNS,
    rows: opts.leads as unknown as Record<string, unknown>[],
    footerNote: 'Confidential — for authorized recipients only.',
  }
}

export { COLUMNS as LEADS_COLUMNS }
