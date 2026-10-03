import { NextResponse } from 'next/server'
import { requireApiSession } from '@/lib/session'
import { CSV_BOM } from '@/lib/csv'
import {
  generateReportPdfBuffer,
  generateReportExcelBuffer,
  generateReportCsv,
  buildReportHtml,
  buildExportFilename,
  contentTypeFor,
} from '@/lib/report-engine'
import { normalizeReport } from '@/lib/report-engine/types'
import type { UniversalReportDefinition, ExportFormat } from '@/lib/report-engine/types'

/**
 * POST /api/reports/export — universal report export
 *
 * Body: { report: UniversalReportDefinition, format: 'pdf'|'csv'|'xlsx'|'print' }
 * Auth: requireApiSession (401 if unauthenticated)
 * Perm: reports.export (with fallback to existing export perms during migration)
 * Returns: file with Content-Type + Content-Disposition: attachment; filename="Kawman-ExAct-{name}-{YYYY-MM-DD}.{ext}"
 *
 * Coexists with legacy per-entity GET /export routes — does NOT break them.
 *
 * ── AUDIT OF EXISTING EXPORT ROUTES (2026-09-15) ────────────────────
 * src/app/api/leads/export/route.ts             GET  perm: leads.export        -> toCSV + csvResponse, leads-{date}.csv
 * src/app/api/companies/export/route.ts         GET  perm: companies.view      -> toCSV + csvResponse, companies-{date}.csv  [perm bug: should be companies.export]
 * src/app/api/contacts/export/route.ts          GET  perm: contacts.view       -> toCSV + csvResponse, contacts-{date}.csv   [perm bug: should be contacts.export]
 * src/app/api/deals/export/route.ts             GET  perm: deals.export        -> toCSV + csvResponse, deals-{date}.csv
 * src/app/api/admin/audit-logs/export/route.ts  GET  perm: audit_logs.view     -> prisma.auditLog + toCSV, audit-log-{date}.csv (supports ?from&to&action, take 5000)
 * src/app/api/ai/reports/*                      — no export endpoint; PDF was client-side via lib/report-pdf.ts (jspdf) —
 * Pattern: all legacy routes are GET, single-entity, CSV-only, filename "{entity}-{YYYY-MM-DD}.csv".
 * Inconsistencies: companies/contacts gate on .view not .export; audit-logs is admin-only; ai/reports has no server export.
 *
 * ── MIGRATION PLAN ──────────────────────────────────────────────────
 * 1) Keep legacy GET /export routes as-is for backwards compat (bookmarks, external scripts, tests).
 * 2) New code should call POST /api/reports/export with UniversalReportDefinition — it supports pdf/csv/xlsx/print + Kawman-ExAct-* naming.
 * 3) When adoption > 90% (grep for /api/(leads|companies|contacts|deals)/export), deprecate legacy routes:
 *    - Add `Deprecation: true` + `Sunset` header + console.warn to each legacy handler.
 *    - After 1 release, make legacy handlers thin wrappers that build a UniversalReportDefinition and call the engine's CSV path.
 * 4) Fix permission bugs: companies/contacts should check companies.export/contacts.export (add those perms to PERMISSIONS if missing) — do in same PR as wrapper step.
 * 5) AI reports: replace client-side lib/report-pdf.ts exportReportPdf with server POST /api/reports/export format='pdf' so PDFs render via the shared html-template → puppeteer pipeline and are testable.
 * 6) Remove legacy routes only after confirming no external consumers (check access logs / search codebase for fetch('/api/.../export')).
 */

const ALLOWED_FORMATS: ExportFormat[] = ['pdf', 'csv', 'xlsx', 'print']

function hasExportPermission(perms: string[]): boolean {
  const allowed = new Set([
    'reports.export',
    'reports.view',
    'leads.export',
    'deals.export',
    'audit_logs.view',
    'companies.view',
    'contacts.view',
  ])
  return perms.some((p) => allowed.has(p))
}

function validateReport(def: unknown): { ok: true; value: UniversalReportDefinition } | { ok: false; error: string } {
  if (!def || typeof def !== 'object') return { ok: false, error: 'report is required' }
  const r = def as Record<string, unknown>
  if (typeof r.name !== 'string' || !r.name.trim()) return { ok: false, error: 'report.name is required' }
  const hasTable = Array.isArray(r.columns) && (r.columns as unknown[]).length > 0
  const hasTables = Array.isArray(r.tables) && (r.tables as unknown[]).length > 0
  const hasSections = Array.isArray(r.sections) && (r.sections as unknown[]).length > 0
  const hasMetrics = Array.isArray(r.metrics) && (r.metrics as unknown[]).length > 0
  const hasCharts = Array.isArray(r.charts) && (r.charts as unknown[]).length > 0
  if (!hasTable && !hasTables && !hasSections && !hasMetrics && !hasCharts) {
    const hasEmptyColumns = Array.isArray(r.columns)
    const hasRows = Array.isArray(r.rows)
    if (!(hasEmptyColumns || hasRows)) {
      return { ok: false, error: 'report must include columns/rows, tables, sections, metrics, or charts' }
    }
  }
  if (r.columns !== undefined) {
    if (!Array.isArray(r.columns)) return { ok: false, error: 'report.columns must be an array' }
    for (const c of r.columns as unknown[]) {
      if (!c || typeof (c as Record<string, unknown>).key !== 'string' || typeof (c as Record<string, unknown>).header !== 'string') {
        return { ok: false, error: 'each column must have {key: string, header: string}' }
      }
    }
  }
  if (r.rows !== undefined && !Array.isArray(r.rows)) return { ok: false, error: 'report.rows must be an array' }
  return { ok: true, value: r as unknown as UniversalReportDefinition }
}

export async function POST(request: Request) {
  let session: Awaited<ReturnType<typeof requireApiSession>>
  try {
    session = await requireApiSession()
  } catch {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const perms = ((session.user as unknown as { permissions?: string[] }).permissions ?? []) as string[]
  if (!hasExportPermission(perms)) {
    return new Response('Forbidden: missing reports.export permission', { status: 403 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { report, format } = (body ?? {}) as { report?: unknown; format?: unknown }

  if (!format || typeof format !== 'string' || !ALLOWED_FORMATS.includes(format as ExportFormat)) {
    return NextResponse.json({ error: `format must be one of: ${ALLOWED_FORMATS.join(', ')}` }, { status: 400 })
  }

  const validated = validateReport(report)
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 })
  }

  const normalized = normalizeReport(validated.value)
  const sessionUser = session.user as unknown as { name?: string; email?: string; organization?: { name?: string } | null }
  const enriched: UniversalReportDefinition = {
    ...normalized,
    metadata: {
      ...normalized.metadata,
      generatedAt: normalized.metadata?.generatedAt ?? new Date().toISOString(),
      generatedBy: normalized.metadata?.generatedBy ?? sessionUser.name ?? sessionUser.email ?? 'Unknown',
      organizationName: normalized.metadata?.organizationName ?? sessionUser.organization?.name ?? undefined,
    },
  }

  // Date for filename — use metadata.generatedAt so repeated exports of same report keep stable date
  const fileDate = enriched.metadata?.generatedAt ? new Date(enriched.metadata.generatedAt) : new Date()

  try {
    if (format === 'csv') {
      const { csv } = generateReportCsv(enriched)
      const filename = buildExportFilename(enriched.name, 'csv', fileDate)
      return new Response(CSV_BOM + csv, {
        headers: {
          'Content-Type': contentTypeFor('csv'),
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'no-store',
          'X-Report-Name': encodeURIComponent(enriched.name),
        },
      })
    }

    if (format === 'xlsx') {
      const buffer = await generateReportExcelBuffer(enriched)
      const filename = buildExportFilename(enriched.name, 'xlsx', fileDate)
      return new Response(buffer as unknown as BodyInit, {
        headers: {
          'Content-Type': contentTypeFor('xlsx'),
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Content-Length': String(buffer.byteLength),
          'Cache-Control': 'no-store',
          'X-Report-Name': encodeURIComponent(enriched.name),
        },
      })
    }

    if (format === 'pdf') {
      // Puppeteer — may need extra memory in serverless; buffer is returned directly
      const { buffer } = await generateReportPdfBuffer(enriched)
      const filename = buildExportFilename(enriched.name, 'pdf', fileDate)
      return new Response(buffer as unknown as BodyInit, {
        headers: {
          'Content-Type': contentTypeFor('pdf'),
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Content-Length': String(buffer.byteLength),
          'Cache-Control': 'no-store',
          'X-Report-Name': encodeURIComponent(enriched.name),
        },
      })
    }

    // print — return premium HTML that auto-calls window.print() on load
    const { html } = buildReportHtml(enriched)
    const withPrint = html.replace('</body>', '<script>window.addEventListener("load",()=>setTimeout(()=>window.print(),300))<\/script></body>')
    const filename = buildExportFilename(enriched.name, 'print', fileDate)
    return new Response(withPrint, {
      headers: {
        'Content-Type': contentTypeFor('print'),
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error('[POST /api/reports/export]', err)
    const msg = err instanceof Error ? err.message : 'Failed to generate export'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
