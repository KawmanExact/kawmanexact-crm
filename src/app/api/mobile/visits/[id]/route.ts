import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { mobileGuard } from '@/lib/mobile-api'

/** Single visit detail for the mobile app. Mobile reps only ever operate on
 * visits assigned to them, so the query is scoped by assigneeId (matching the
 * list endpoint and the per-visit mutation routes).
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const g = await mobileGuard('field_visits.view')
  if ('error' in g) return g.error
  const { session } = g

  const r = await prisma.fieldVisit.findFirst({
    where: { id, organizationId: session.user.organizationId, assigneeId: session.user.id },
    include: {
      company: { select: { name: true } },
      contact: { select: { name: true } },
      checkIns: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true, photoUrl: true } },
    },
  })
  if (!r) return NextResponse.json({ error: 'Visit not found' }, { status: 404 })

  return NextResponse.json({
    visit: {
      id: r.id,
      title: r.title,
      purpose: r.purpose,
      status: r.status,
      scheduledAt: r.scheduledAt.toISOString(),
      address: r.address,
      latitude: r.latitude != null ? Number(r.latitude) : null,
      longitude: r.longitude != null ? Number(r.longitude) : null,
      company: r.company?.name ?? null,
      contact: r.contact?.name ?? null,
      lastCheckInAt: r.checkIns[0]?.createdAt.toISOString() ?? null,
    },
  })
}

/** Delete a visit assigned to the authenticated mobile user. Allows any
 * field_visits.delete-capable user to remove their own assigned visit
 * (including COMPLETED ones), mirroring the web delete permission scope.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const g = await mobileGuard('field_visits.delete')
  if ('error' in g) return g.error
  const { session } = g

  const existing = await prisma.fieldVisit.findFirst({
    where: { id, organizationId: session.user.organizationId, assigneeId: session.user.id },
  })
  if (!existing) return NextResponse.json({ error: 'Visit not found' }, { status: 404 })

  await prisma.fieldVisit.delete({ where: { id } })

  return NextResponse.json({ success: true })
}
