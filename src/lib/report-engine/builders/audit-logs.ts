import type { UniversalReportDefinition, ReportColumn } from '../types'

export interface AuditLogRow {
  createdAt: string
  action: string
  actor: string
  actorEmail: string
  resource: string
  resourceId: string
  metadata: string
}

const COLUMNS: ReportColumn[] = [
  { key: 'createdAt', header: 'Timestamp', format: 'datetime' },
  { key: 'action', header: 'Action' },
  { key: 'actor', header: 'Actor' },
  { key: 'actorEmail', header: 'Actor Email' },
  { key: 'resource', header: 'Resource' },
]

export function buildAuditLogReport(opts: {
  rows: AuditLogRow[]
  generatedBy?: string
  organizationName?: string
  filters?: Record<string, string>
}): UniversalReportDefinition {
  return {
    name: 'Audit-Log',
    title: 'Audit Log Report',
    subtitle: `${opts.rows.length} events — permission: audit_logs.view`,
    filters: opts.filters,
    metadata: {
      generatedAt: new Date().toISOString(),
      generatedBy: opts.generatedBy,
      organizationName: opts.organizationName,
      recordCount: opts.rows.length,
    },
    columns: COLUMNS,
    rows: opts.rows as unknown as Record<string, unknown>[],
  }
}
