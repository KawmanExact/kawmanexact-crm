/**
 * Universal Report Engine — public barrel
 * A developer creates a report by defining its UniversalReportDefinition
 * and calls the engine to get PDF / XLSX / CSV / HTML without writing
 * another custom exporter.
 *
 * Data passed into the engine is already scoped by the caller:
 * - Organization scope (organizationId filter at service layer)
 * - Permission / record-scope filter (getRecordScope → ALL | DEPARTMENT | OWN)
 * The engine never re-queries the DB — it renders exactly what it is given.
 */

export * from './types'
export { buildReportHtml } from './html-template'
export { generateReportPdfBuffer, generateReportHtml, closePdfBrowser } from './pdf'
export { generateReportExcelBuffer } from './excel'
export { generateReportCsv, generateReportCsvPerTable } from './csv-export'

// ---------------------------------------------------------------------------
// Filename + content-type helpers — shared by API route and client export-menu
// ---------------------------------------------------------------------------
export type ExportFormat = 'pdf' | 'csv' | 'xlsx' | 'print'

/** Sanitize a report name for use in a filename: collapse non-alphanumerics to '-', trim, cap length. */
export function sanitizeFileNamePart(name: string): string {
  return name.trim().replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'Report'
}

/**
 * Kawman-ExAct-{ReportName}-{Date}.{ext}
 * Date is ISO YYYY-MM-DD (en-IN local date would vary by server TZ; ISO is stable for filenames).
 * Callers may pass a custom date for testing; defaults to now.
 */
export function buildExportFilename(
  reportName: string,
  format: ExportFormat,
  date = new Date(),
): string {
  const safe = sanitizeFileNamePart(reportName)
  const d = date.toISOString().slice(0, 10)
  const ext =
    format === 'xlsx' ? 'xlsx' : format === 'csv' ? 'csv' : format === 'print' ? 'html' : 'pdf'
  return `Kawman-ExAct-${safe}-${d}.${ext}`
}

export function contentTypeFor(format: ExportFormat): string {
  switch (format) {
    case 'pdf':
      return 'application/pdf'
    case 'xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    case 'csv':
      return 'text/csv; charset=utf-8'
    case 'print':
      return 'text/html; charset=utf-8'
    default:
      return 'application/octet-stream'
  }
}

// ---------------------------------------------------------------------------
// Unified dispatch — single entry point for API routes
// ---------------------------------------------------------------------------
import type { UniversalReportDefinition } from './types'

export interface DispatchResult {
  buffer: Buffer | string
  contentType: string
  filename: string
  landscape?: boolean
  isPrintHtml?: boolean
}

/**
 * Generate the requested export format from a UniversalReportDefinition.
 * Centralizes filename + content-type logic so API routes stay thin.
 *
 * Usage (API route):
 *   const { buffer, contentType, filename } = await dispatchExport(report, format)
 *   return new NextResponse(buffer, { headers: { 'Content-Type': contentType, 'Content-Disposition': `attachment; filename="${filename}"` } })
 */
export async function dispatchExport(
  report: UniversalReportDefinition,
  format: ExportFormat,
): Promise<DispatchResult> {
  const filename = buildExportFilename(report.name, format)
  const contentType = contentTypeFor(format)

  if (format === 'print') {
    const { buildReportHtml } = await import('./html-template')
    const { html, landscape } = buildReportHtml(report)
    return { buffer: html, contentType, filename, landscape, isPrintHtml: true }
  }

  if (format === 'csv') {
    const { generateReportCsv } = await import('./csv-export')
    const { csv } = generateReportCsv(report)
    return { buffer: csv, contentType, filename }
  }

  if (format === 'xlsx') {
    const { generateReportExcelBuffer } = await import('./excel')
    const buffer = await generateReportExcelBuffer(report)
    return { buffer, contentType, filename }
  }

  // pdf (default)
  const { generateReportPdfBuffer } = await import('./pdf')
  const { buffer, landscape } = await generateReportPdfBuffer(report)
  return { buffer, contentType, filename, landscape }
}

// ---------------------------------------------------------------------------
// Convenience builder for simple tabular reports (Leads, Deals, etc.)
// ---------------------------------------------------------------------------
import type { ReportColumn } from './types'

export function createTableReport(opts: {
  name: string
  title?: string
  subtitle?: string
  columns: ReportColumn[]
  rows: Record<string, unknown>[]
  filters?: Record<string, string>
  generatedBy?: string
  organizationName?: string
  periodLabel?: string
  recordCount?: number
}): UniversalReportDefinition {
  return {
    name: opts.name,
    title: opts.title ?? opts.name,
    subtitle: opts.subtitle ?? opts.periodLabel,
    periodLabel: opts.periodLabel,
    columns: opts.columns,
    rows: opts.rows,
    filters: opts.filters,
    metadata: {
      generatedAt: new Date().toISOString(),
      generatedBy: opts.generatedBy,
      organizationName: opts.organizationName,
      recordCount: opts.recordCount ?? opts.rows.length,
    },
  }
}
