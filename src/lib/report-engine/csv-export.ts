import 'server-only'

import type { UniversalReportDefinition, ReportTable } from './types'
import { normalizeReport } from './types'
import { toCSV, type CsvColumn } from '@/lib/csv'

/** Build CsvColumn descriptors from a report table, honouring the csvText hint. */
function csvColumns(t: ReportTable): CsvColumn<never>[] {
  return t.columns.map((c) => ({ key: c.key as never, header: c.header, asText: c.csvText }))
}

function tablesFromReport(def: UniversalReportDefinition): ReportTable[] {
  const d = normalizeReport(def)
  const out: ReportTable[] = [...(d.tables ?? [])]
  if (!out.length && d.columns?.length && d.rows?.length) {
    out.push({ columns: d.columns, rows: d.rows, title: d.title ?? d.name })
  }
  for (const sec of d.sections ?? []) {
    for (const t of sec.tables ?? []) out.push(t)
  }
  return out
}

/**
 * CSV exporter for the universal report framework.
 * Reuses the proven `toCSV` helper from `src/lib/csv.ts` (RFC 4180: quoted fields,
 * doubled embedded quotes, CRLF line endings).
 *
 * - Single table → plain CSV (header + rows), directly usable by Excel/Sheets.
 * - Multiple tables → concatenated with `# {title}` separator lines and a blank line
 *   between tables (preserves readability when opened as one file; consumers that need
 *   per-table files should call this once per table or split on the `# ` markers).
 * - Large datasets: toCSV already streams via array joins; for very large tables
 *   (100k+ rows) prefer XLSX or paginated server-side export instead.
 * - Data is pre-scoped by the caller (org + permission filters applied upstream);
 *   this function never accesses the database.
 */
export function generateReportCsv(def: UniversalReportDefinition): { csv: string; tableCount: number } {
  const tables = tablesFromReport(def)
  if (!tables.length) return { csv: '', tableCount: 0 }

  if (tables.length === 1) {
    const t = tables[0]
    const csv = toCSV(
      // toCSV is generic over row shape; Universal rows are Record<string, unknown>
      t.rows as Record<string, unknown>[] as never,
      csvColumns(t),
    )
    return { csv, tableCount: 1 }
  }

  const parts: string[] = []
  for (const t of tables) {
    if (t.title) parts.push(`# ${t.title}`)
    parts.push(
      toCSV(
        t.rows as Record<string, unknown>[] as never,
        csvColumns(t),
      ),
    )
    parts.push('') // blank line between tables
  }
  // Remove trailing blank entry's extra separator — keep exactly one blank line between tables
  if (parts[parts.length - 1] === '') parts.pop()
  return { csv: parts.join('\r\n'), tableCount: tables.length }
}

/**
 * For callers that need one CSV file per table (e.g. zipped multi-file download).
 */
export function generateReportCsvPerTable(
  def: UniversalReportDefinition,
): Array<{ title: string; csv: string }> {
  const tables = tablesFromReport(def)
  return tables.map((t, i) => ({
    title: t.title ?? `Table ${i + 1}`,
    csv: toCSV(
      t.rows as Record<string, unknown>[] as never,
      csvColumns(t),
    ),
  }))
}
