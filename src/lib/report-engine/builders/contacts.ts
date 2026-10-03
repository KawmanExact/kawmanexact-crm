import type { UniversalReportDefinition, ReportColumn } from '../types'
import type { Contact } from '@/types/crm'
import { toContactCsvRows } from '@/lib/contacts-csv'

const COLUMNS: ReportColumn[] = [
  { key: 'name', header: 'Name' },
  { key: 'company', header: 'Company' },
  { key: 'designation', header: 'Designation' },
  { key: 'email', header: 'Email' },
  { key: 'phone', header: 'Phone', format: 'text', csvText: true },
  { key: 'mobile', header: 'Mobile', format: 'text', csvText: true },
  { key: 'address', header: 'Address' },
]

export function buildContactsReport(opts: {
  contacts: Contact[]
  generatedBy?: string
  organizationName?: string
  filters?: Record<string, string>
}): UniversalReportDefinition {
  return {
    name: 'Contacts',
    title: 'Contacts Report',
    subtitle: `${opts.contacts.length} contacts — scoped to your organization and permissions`,
    filters: opts.filters,
    metadata: {
      generatedAt: new Date().toISOString(),
      generatedBy: opts.generatedBy,
      organizationName: opts.organizationName,
      recordCount: opts.contacts.length,
    },
    columns: COLUMNS,
    rows: toContactCsvRows(opts.contacts) as unknown as Record<string, unknown>[],
  }
}

export { COLUMNS as CONTACTS_COLUMNS }
