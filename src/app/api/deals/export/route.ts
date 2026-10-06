/**
 * GET /api/deals/export?format=xlsx|pdf|csv
 */
import { NextResponse } from 'next/server'
import { requireApiSession } from '@/lib/session'
import { toCSV, csvResponse, CSV_BOM } from '@/lib/csv'
import { buildDealExportWorkbook } from '@/lib/deal-export-workbook'
import { buildDealExportPdf } from '@/lib/deal-export-pdf'
import { getDealsForExport } from '@/services/deal.service'
import { DEAL_EXPORT_COLUMNS, type DealExportRow, toExportRow } from '@/lib/deal-export-columns'

// exceljs / jspdf need Node APIs, so pin the runtime explicitly.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CONTENT_TYPES = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
  csv: 'text/csv; charset=utf-8',
} as const

type ExportFormat = keyof typeof CONTENT_TYPES

function isExportFormat(value: string | null): value is ExportFormat {
  return value !== null && Object.prototype.hasOwnProperty.call(CONTENT_TYPES, value)
}

export async function GET(request: Request) {
  let session
  try {
    session = await requireApiSession()
  } catch {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  if (!(session.user.permissions as string[]).includes('deals.export')) {
    return new Response('Forbidden', { status: 403 })
  }

  const url = new URL(request.url)
  const requestedFormat = url.searchParams.get('format')
  if (!isExportFormat(requestedFormat)) {
    return NextResponse.json(
      { error: `format must be one of: ${Object.keys(CONTENT_TYPES).join(', ')}` },
      { status: 400 }
    )
  }

  const stage = url.searchParams.get('stage') ?? undefined
  const search = url.searchParams.get('q') ?? undefined

  const filterLines: string[] = []
  if (stage) filterLines.push(`Stage: ${stage}`)
  if (search) filterLines.push(`Search: ${search}`)

  const rawDeals = await getDealsForExport({ stage, search })
  const rows: DealExportRow[] = rawDeals.map((d, idx) => toExportRow(d as any, idx))

  const meta = {
    organizationName: session.user.organization?.name ?? 'Organization',
    generatedBy: session.user.name,
    generatedAt: new Date(),
    filters: filterLines,
  }

  if (requestedFormat === 'xlsx') {
    const buffer = await buildDealExportWorkbook(rows, meta)
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': CONTENT_TYPES.xlsx,
        'Content-Disposition': `attachment; filename="deals-${new Date().toISOString().slice(0, 10)}.xlsx"`,
      },
    })
  }

  if (requestedFormat === 'pdf') {
    const buffer = buildDealExportPdf({
      rows,
      organizationName: meta.organizationName,
      generatedBy: meta.generatedBy,
      generatedAt: meta.generatedAt,
      filters: meta.filters,
    })
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': CONTENT_TYPES.pdf,
        'Content-Disposition': `attachment; filename="deals-${new Date().toISOString().slice(0, 10)}.pdf"`,
      },
    })
  }

  const csvColumns = DEAL_EXPORT_COLUMNS.map((c) => ({
    key: c.key,
    header: c.header,
    asText: c.type === 'text' && (c.key === 'pincode' || c.key === 'contactNumber'),
  }))

  const safeRows = rows.map((r) => {
    const copy: Record<string, unknown> = { ...r }
    for (const col of csvColumns) {
      if (col.asText) continue
      const val = copy[col.key]
      if (typeof val === 'string' && /^[=+\-@]/.test(val)) {
        copy[col.key] = `'${val}`
      }
    }
    return copy
  })

  const rawCsv = toCSV(safeRows, csvColumns)
  return csvResponse(CSV_BOM + rawCsv, `deals-${new Date().toISOString().slice(0, 10)}.csv`)
}
