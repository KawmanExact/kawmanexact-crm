import type { UniversalReportDefinition, ReportColumn } from '../types'
import type { Company } from '@/types/crm'

const COLUMNS: ReportColumn[] = [
  { key: 'name', header: 'Name' },
  { key: 'industry', header: 'Industry' },
  { key: 'website', header: 'Website' },
  { key: 'phone', header: 'Phone' },
  { key: 'email', header: 'Email' },
  { key: 'city', header: 'City' },
  { key: 'state', header: 'State' },
  { key: 'employees', header: 'Employees', align: 'right', format: 'number' },
  { key: 'revenue', header: 'Revenue', align: 'right', format: 'currency' },
  { key: 'owner', header: 'Owner' },
  { key: 'status', header: 'Status' },
  { key: 'createdAt', header: 'Created At', format: 'date' },
]

export function buildCompaniesReport(opts: {
  companies: Company[]
  generatedBy?: string
  organizationName?: string
  filters?: Record<string, string>
}): UniversalReportDefinition {
  return {
    name: 'Companies',
    title: 'Companies Report',
    subtitle: `${opts.companies.length} companies — scoped to your organization and permissions`,
    filters: opts.filters,
    metadata: {
      generatedAt: new Date().toISOString(),
      generatedBy: opts.generatedBy,
      organizationName: opts.organizationName,
      recordCount: opts.companies.length,
    },
    columns: COLUMNS,
    rows: opts.companies as unknown as Record<string, unknown>[],
  }
}

export { COLUMNS as COMPANIES_COLUMNS }
