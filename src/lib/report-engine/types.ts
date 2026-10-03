/**
 * Universal Report Engine — Types
 * Generic, content-driven definitions. A report provides only what it needs
 * and automatically receives the same Kawman ExAct premium design.
 *
 * Data passed in `rows` / `tables` is already scoped by the caller:
 * - Organization scope (organizationId filter applied in service layer)
 * - Permission / record-scope filter (getRecordScope → ALL | DEPARTMENT | OWN)
 * The engine never re-queries the DB — it renders exactly what it is given.
 */

export type ExportFormat = 'pdf' | 'csv' | 'xlsx' | 'print'

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------
export interface ReportMetadata {
  generatedAt?: string // ISO string
  generatedBy?: string
  organizationName?: string
  dateRange?: string
  recordCount?: number
  /** Any extra key→value shown in the header meta strip */
  extra?: Record<string, string>
}

export interface ReportFilters {
  [label: string]: string // e.g. "Date Range" -> "1 Sep – 15 Sep 2026"
}

export type MetricTrend = {
  value: string // e.g. "+12%”, “↑ 8”
  direction?: 'up' | 'down' | 'neutral'
  label?: string
}

export interface ReportMetric {
  label: string // e.g. "TOTAL LEADS"
  value: string // formatted, e.g. "1,248" or "₹3,00,000"
  sublabel?: string // e.g. "vs last month"
  trend?: MetricTrend
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'info'
  icon?: string // lucide icon name hint, e.g. "Users"
}

export type ChartType = 'bar' | 'line' | 'area' | 'pie' | 'donut' | 'progress'

export interface ReportChartSeries {
  key: string // data key
  label: string
  color?: string
}

export interface ReportChart {
  id?: string
  title: string
  subtitle?: string
  type: ChartType
  data: Record<string, unknown>[]
  xKey: string // e.g. "month", "name"
  series: ReportChartSeries[] // one or more y series
  currencyKeys?: string[]
  percentKeys?: string[]
  height?: number
}

export type CellAlign = 'left' | 'center' | 'right'
export type CellFormat = 'text' | 'currency' | 'number' | 'percent' | 'date' | 'datetime'

export interface ReportColumn {
  key: string
  header: string
  width?: number // hint in characters
  align?: CellAlign
  format?: CellFormat
  /** CSV only: force this column to render as Excel text (`="..."`) so values
   * such as phone numbers are not re-parsed as numbers (no scientific
   * notation, no leading-zero loss). Ignored for PDF/XLSX rendering. */
  csvText?: boolean
}

export interface ReportTable {
  id?: string
  title?: string
  subtitle?: string
  columns: ReportColumn[]
  rows: Record<string, unknown>[]
  emptyMessage?: string
}

export type InsightVariant = 'info' | 'success' | 'warning' | 'danger' | 'highlight'

export interface ReportInsight {
  title: string
  description: string
  variant?: InsightVariant
  icon?: string
}

export interface ReportSection {
  id?: string
  title: string
  description?: string
  metrics?: ReportMetric[]
  charts?: ReportChart[]
  tables?: ReportTable[]
  insights?: ReportInsight[]
  text?: string // markdown-ish plain text with **bold** and - bullets
}

// ---------------------------------------------------------------------------
// Top-level universal definition
// ---------------------------------------------------------------------------
export interface UniversalReportDefinition {
  id?: string
  name: string // slug-like, used in filename: Kawman-ExAct-{name}-{date}
  title: string // Display title
  subtitle?: string
  periodLabel?: string // e.g. "1 Sep – 15 Sep 2026"
  metadata?: ReportMetadata
  filters?: ReportFilters
  metrics?: ReportMetric[]
  charts?: ReportChart[]
  tables?: ReportTable[]
  insights?: ReportInsight[]
  highlights?: ReportInsight[] // alias for insights, for backwards compat
  sections?: ReportSection[]
  // Convenience for simple tabular exports (leads, deals, etc.)
  columns?: ReportColumn[]
  rows?: Record<string, unknown>[]
  footerNote?: string
  /** PDF layout hint — 'auto' (default) picks landscape when any table has >=7 columns */
  orientation?: 'portrait' | 'landscape' | 'auto'
}

// ---------------------------------------------------------------------------
// Legacy compat — earlier minimal definition used columns/rows at top level
// ---------------------------------------------------------------------------
export type LegacyReportDefinition = {
  name: string
  title?: string
  subtitle?: string
  columns: ReportColumn[]
  rows: Record<string, unknown>[]
  filters?: Record<string, string>
  generatedAt?: string
  generatedBy?: string
  organizationName?: string
}

export function normalizeReport(
  def: UniversalReportDefinition | LegacyReportDefinition,
): UniversalReportDefinition {
  const d = def as UniversalReportDefinition
  if (d.columns && d.rows && !d.tables && !d.sections) {
    const legacy = def as LegacyReportDefinition
    return {
      ...d,
      title: d.title ?? d.name,
      tables: [{ columns: d.columns, rows: d.rows }],
      metadata: {
        generatedAt: legacy.generatedAt,
        generatedBy: legacy.generatedBy,
        organizationName: legacy.organizationName,
      },
    }
  }
  return { ...d, title: d.title ?? d.name }
}

export interface ExportRequestBody {
  report: UniversalReportDefinition
  format: ExportFormat
}

export interface ExportResult {
  buffer: Uint8Array | Buffer | string
  contentType: string
  filename: string
  isPrintHtml?: boolean
}
