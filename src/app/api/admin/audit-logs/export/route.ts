import { NextResponse } from 'next/server'
import { requireApiSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { toCSV, csvResponse } from '@/lib/csv'

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
  }))

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
