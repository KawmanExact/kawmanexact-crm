import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { mobileGuard, badRequest } from '@/lib/mobile-api'
import { findOrCreateCompanyByName } from '@/services/company.service'
import { findOrCreateContactByName } from '@/services/contact.service'

/** My visits (assigned to me), newest schedule first. ?scope=today|upcoming|all */
export async function GET(request: Request) {
  const g = await mobileGuard('field_visits.view')
  if ('error' in g) return g.error
  const { session } = g
  const scope = new URL(request.url).searchParams.get('scope') ?? 'all'

  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  const when =
    scope === 'today' ? { scheduledAt: { gte: start, lt: end } } :
    scope === 'upcoming' ? { scheduledAt: { gte: start } } : {}

  const rows = await prisma.fieldVisit.findMany({
    where: { organizationId: session.user.organizationId, assigneeId: session.user.id, ...when },
    include: {
      company: { select: { name: true } },
      contact: { select: { name: true } },
      checkIns: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true, photoUrl: true } },
    },
    orderBy: { scheduledAt: scope === 'upcoming' ? 'asc' : 'desc' },
    take: 100,
  })

  return NextResponse.json({
    visits: rows.map((r) => ({
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
    })),
  })
}

const createSchema = z.object({
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
})

export async function POST(request: Request) {
  const g = await mobileGuard('field_visits.create', { key: 'mobile-visit-create', max: 30, windowSec: 60 })
  if ('error' in g) return g.error
  const { session } = g

  const body = await request.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    const fe: Record<string, string> = {}
    for (const i of parsed.error.issues) fe[String(i.path[0])] = i.message
    return badRequest('Invalid visit', fe)
  }
  const d = parsed.data
  const scheduledAt = new Date(d.scheduledAt)
  if (Number.isNaN(scheduledAt.getTime())) return badRequest('Invalid date', { scheduledAt: 'Enter a valid date/time' })

  // The mobile app always creates visits for the signed-in rep.
  const assigneeId = session.user.id

  const company = d.company
    ? await findOrCreateCompanyByName({ name: d.company, organizationId: session.user.organizationId, ownerId: assigneeId })
    : null
  const contact = d.contactName
    ? await findOrCreateContactByName({
        name: d.contactName,
        email: d.contactEmail || null,
        mobile: d.contactMobile || null,
        organizationId: session.user.organizationId,
        ownerId: assigneeId,
        companyId: company?.id ?? null,
      })
    : null

  const visit = await prisma.fieldVisit.create({
    data: {
      title: d.title,
      purpose: d.purpose,
      scheduledAt,
      status: 'SCHEDULED',
      address: d.address || null,
      latitude: d.latitude ?? null,
      longitude: d.longitude ?? null,
      organizationId: session.user.organizationId,
      assigneeId,
      companyId: company?.id ?? null,
      contactId: contact?.id ?? null,
    },
    select: { id: true },
  })
  return NextResponse.json({ id: visit.id }, { status: 201 })
}
