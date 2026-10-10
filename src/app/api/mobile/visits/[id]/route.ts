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
      company: { select: { id: true, name: true } },
      contact: { select: { id: true, name: true } },
      checkIns: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true, photoUrl: true } },
      visitReports: { select: { id: true, createdAt: true, nextSteps: true } },
    },
  })
  if (!r) return NextResponse.json({ error: 'Visit not found' }, { status: 404 })

  // Query follow-ups linked to this visit's company/contact.
  const followUpWhere: { organizationId: string; companyId?: string; contactId?: string } = {
    organizationId: session.user.organizationId,
  }
  if (r.companyId) followUpWhere.companyId = r.companyId
  if (r.contactId) followUpWhere.contactId = r.contactId

  const followUps = await prisma.followUp.findMany({
    where: followUpWhere,
    select: { id: true, title: true, dueDate: true, status: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

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
      companyId: r.company?.id ?? null,
      contact: r.contact?.name ?? null,
      contactId: r.contact?.id ?? null,
      lastCheckInAt: r.checkIns[0]?.createdAt.toISOString() ?? null,
      visitReport: r.visitReports[0]
        ? {
            id: r.visitReports[0].id,
            createdAt: r.visitReports[0].createdAt.toISOString(),
            nextSteps: r.visitReports[0].nextSteps ?? '',
          }
        : null,
      followUps: followUps.map((f) => ({
        id: f.id,
        title: f.title,
        dueDate: f.dueDate.toISOString(),
        status: f.status,
      })),
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
