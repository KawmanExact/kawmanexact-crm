import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { mobileGuard, badRequest } from '@/lib/mobile-api'
import { findOrCreateCompanyByName } from '@/services/company.service'
import { findOrCreateContactByName } from '@/services/contact.service'

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
      purposeMeta: r.purposeMeta as { productIds?: string[]; purposeOther?: string } | null,
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

const patchSchema = z.object({
  title: z.string().trim().min(2),
  purpose: z.string().trim().min(2),
  scheduledAt: z.string().trim().min(1),
  company: z.string().trim().optional(),
  contactName: z.string().trim().optional(),
  contactEmail: z.string().trim().email().optional().or(z.literal('')),
  contactMobile: z.string().trim().optional(),
  address: z.string().trim().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  productIds: z.array(z.string()).max(50).optional(),
  purposeOther: z.string().trim().max(120).optional(),
})

/**
 * Update a visit assigned to the authenticated mobile user. Mirrors the
 * create flow's company/contact upsert (find-or-create by name, backfilling
 * only blanks) so editing a title/company never wipes an existing contact's
 * email/mobile. Latitude/longitude are only written when provided (the mobile
 * form only sends them when "use my location" is tapped), otherwise the
 * existing coordinates are preserved.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const g = await mobileGuard('field_visits.update', { key: 'mobile-visit-update', max: 30, windowSec: 60 })
  if ('error' in g) return g.error
  const { session } = g

  const body = await request.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    const fe: Record<string, string> = {}
    for (const i of parsed.error.issues) fe[String(i.path[0])] = i.message
    return badRequest('Invalid visit', fe)
  }
  const d = parsed.data
  const scheduledAt = new Date(d.scheduledAt)
  if (Number.isNaN(scheduledAt.getTime())) return badRequest('Invalid date', { scheduledAt: 'Enter a valid date/time' })

  const existing = await prisma.fieldVisit.findFirst({
    where: { id, organizationId: session.user.organizationId, assigneeId: session.user.id },
  })
  if (!existing) return NextResponse.json({ error: 'Visit not found' }, { status: 404 })

  const assigneeId = session.user.id

  let companyId = existing.companyId
  if (d.company) {
    const company = await findOrCreateCompanyByName({ name: d.company, organizationId: session.user.organizationId, ownerId: assigneeId })
    companyId = company?.id ?? null
  }

  let contactId = existing.contactId
  if (d.contactName) {
    const contact = await findOrCreateContactByName({
      name: d.contactName,
      email: d.contactEmail || null,
      mobile: d.contactMobile || null,
      organizationId: session.user.organizationId,
      ownerId: assigneeId,
      companyId,
    })
    contactId = contact?.id ?? null
  }

  let purposeMeta = existing.purposeMeta
  if (d.productIds?.length || d.purposeOther) {
    purposeMeta = { productIds: d.productIds ?? [], purposeOther: d.purposeOther ?? null }
  }

  const updateData: Record<string, unknown> = {
    title: d.title,
    purpose: d.purpose,
    scheduledAt,
    address: d.address || null,
    assigneeId,
    companyId,
    contactId,
    purposeMeta,
  }
  if (d.latitude != null) updateData.latitude = d.latitude
  if (d.longitude != null) updateData.longitude = d.longitude

  await prisma.fieldVisit.update({ where: { id }, data: updateData })

  return NextResponse.json({ ok: true, id })
}
