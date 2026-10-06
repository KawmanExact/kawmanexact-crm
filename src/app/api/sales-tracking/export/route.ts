/**
 * GET /api/sales-tracking/export?format=xlsx|pdf|csv&<sales filters>
 *
 * The query string is the SAME one the page uses, so the file contains exactly
 * the rows on screen. Filters are re-parsed server-side with the shared parser
 * and re-scoped to the caller's permissions — the client cannot widen them.
 */
import { NextResponse } from 'next/server'
import { requireApiSession } from '@/lib/session'
import {
  EXPORT_ROW_CAPS,
  buildSalesCsv,
  buildSalesPdf,
  buildSalesWorkbook,
  salesExportFilename,
  type ExportFormat,
} from '@/lib/sales-export'
import { getSalesExportData } from '@/services/sales.service'

// exceljs / pdf libraries need Node APIs, so pin the runtime explicitly.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CONTENT_TYPES: Record<ExportFormat, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
  csv: 'text/csv; charset=utf-8',
}

const FORMAT_LABEL: Record<ExportFormat, string> = {
  xlsx: 'Excel',
  pdf: 'PDF',
  csv: 'CSV',
}

function isExportFormat(value: string | null): value is ExportFormat {
  return value !== null && Object.prototype.hasOwnProperty.call(EXPORT_ROW_CAPS, value)
}

export async function GET(request: Request) {
  let session
  try {
    session = await requireApiSession()
  } catch {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const permissions = (session.user.permissions ?? []) as string[]
  if (!permissions.includes('sales.export')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const url = new URL(request.url)
  const requestedFormat = url.searchParams.get('format')
  if (!isExportFormat(requestedFormat)) {
    return NextResponse.json(
      { error: `format must be one of: ${Object.keys(EXPORT_ROW_CAPS).join(', ')}` },
      { status: 400 }
    )
  }

  // Everything except `format` / `print` is a sales filter. page/pageSize are
  // ignored by getSalesExportData (an export is never paginated).
  const rawParams: Record<string, string | string[]> = {}
  url.searchParams.forEach((value, key) => {
    if (key === 'format' || key === 'print') return
    rawParams[key] = value
  })

  try {
    const cap = EXPORT_ROW_CAPS[requestedFormat]
    const data = await getSalesExportData(rawParams, cap)

    if (data.rows.length === 0) {
      return NextResponse.json(
        { error: 'No sales match the selected filters, so there is nothing to export.' },
        { status: 404 }
      )
    }

    const meta = {
      organizationName: data.organizationName,
      generatedBy: data.generatedBy,
      generatedAt: new Date(),
      filterLines: data.filterLines,
      truncated: data.truncated ? { shown: data.rows.length, total: data.total } : undefined,
    }

    const filename = salesExportFilename(requestedFormat, meta.organizationName)
    const headers = {
      'Content-Type': CONTENT_TYPES[requestedFormat],
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
      'X-Export-Format': FORMAT_LABEL[requestedFormat],
    }

    if (requestedFormat === 'csv') {
      return new Response(buildSalesCsv(data.rows), { status: 200, headers })
    }

    const body: Buffer =
      requestedFormat === 'xlsx'
        ? await buildSalesWorkbook({
            rows: data.rows,
            products: data.products,
            salespeople: data.salespeople,
            kpis: data.kpis,
            meta,
          })
        : buildSalesPdf({ rows: data.rows, kpis: data.kpis, meta })

    return new Response(new Uint8Array(body), { status: 200, headers })
  } catch (err) {
    console.error(`[sales export:${requestedFormat}] failed:`, err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Export failed' },
      { status: 500 }
    )
  }
}