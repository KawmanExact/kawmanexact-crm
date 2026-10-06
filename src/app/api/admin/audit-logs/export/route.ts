/**
 * GET /api/admin/audit-logs/export?format=xlsx|csv&from=&to=&action=
 */
import { NextResponse } from 'next/server'
import { requireApiSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { toCSV, csvResponse } from '@/lib/csv'
import { buildWorkbook } from '@/lib/excel-workbook'

const CONTENT_TYPES = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv; charset=utf-8',
} as const

type ExportFormat = keyof typeof CONTENT_TYPES

function isExportFormat(value: string | null): value is ExportFormat {
  return value !== null && Object.prototype.hasOwnProperty.call(CONTENT_TYPES, value)
}

type AuditLogRow = {
  createdAt: string
  action: string
  actor: string
  actorEmail: string
  resource: string
  resourceId: string
  metadata: string
}

export async function GET(request: Request) {
  let session
  try {
    session = await requireApiSession()
  } catch {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  if (!(session.user.permissions as string[]).includes('audit_logs.view')) {
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

  const { searchParams } = new URL(request.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const action = searchParams.get('action')

  const logs = await prisma.auditLog.findMany({
    where: {
      organizationId: session.user.organizationId,
      ...(action ? { action: action as never } : {}),
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(`${to}T23:59:59`) } : {}),
            },
          }
        : {}),
    },
    include: { actor: { select: { name: true, email: true } } },
    orderBy: { createdAt: 'desc' },
    take: 5000,
  })

  const rows = logs.map((l) => ({
    createdAt: l.createdAt.toISOString(),
    action: l.action,
    actor: l.actor?.name ?? 'Unknown',
    actorEmail: l.actor?.email ?? '',
    resource: l.resource,
    resourceId: l.resourceId ?? '',
    metadata: l.metadata ? JSON.stringify(l.metadata) : '',
  })) as AuditLogRow[]

  const meta = {
    organizationName: session.user.organization?.name ?? 'Organization',
    generatedBy: session.user.name,
    generatedAt: new Date(),
    filterLines: [
      `Date Range: ${from ?? 'start'} to ${to ?? 'now'}`,
      action ? `Action: ${action}` : '',
    ].filter(Boolean),
  }

  if (requestedFormat === 'xlsx') {
    const columns = [
      { header: 'Timestamp', key: 'createdAt', width: 22, render: (r: AuditLogRow) => new Date(r.createdAt) },
      { header: 'Action', key: 'action', width: 25 },
      { header: 'Actor', key: 'actor', width: 20 },
      { header: 'Actor Email', key: 'actorEmail', width: 30 },
      { header: 'Resource', key: 'resource', width: 20 },
      { header: 'Resource ID', key: 'resourceId', width: 18 },
      { header: 'Metadata', key: 'metadata', width: 50 },
    ]

    const buffer = await buildWorkbook({
      sheets: [
        {
          name: 'Audit Log',
          title: 'Audit Log',
          columns,
          rows,
        },
      ],
      meta,
    })

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': CONTENT_TYPES.xlsx,
        'Content-Disposition': `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.xlsx"`,
      },
    })
  }

  const csv = toCSV(rows, [
    { key: 'createdAt', header: 'Timestamp' },
    { key: 'action', header: 'Action' },
    { key: 'actor', header: 'Actor' },
    { key: 'actorEmail', header: 'Actor Email' },
    { key: 'resource', header: 'Resource' },
    { key: 'resourceId', header: 'Resource ID' },
    { key: 'metadata', header: 'Metadata' },
  ])

  return csvResponse(csv, `audit-log-${new Date().toISOString().slice(0, 10)}.csv`)
}