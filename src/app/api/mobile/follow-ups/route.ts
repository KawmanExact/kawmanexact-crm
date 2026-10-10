import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { mobileGuard, badRequest } from '@/lib/mobile-api'

const createSchema = z.object({
  title: z.string().trim().min(2, 'Title is required'),
  description: z.string().trim().max(8000).optional(),
  dueDate: z.string().trim().min(1, 'Due date is required'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).default('MEDIUM'),
  companyId: z.string().optional(),
  contactId: z.string().optional(),
  dealId: z.string().optional(),
  leadId: z.string().optional(),
})

/** Follow-ups for the authenticated mobile user. */
export async function GET() {
  const g = await mobileGuard('field_visits.view')
  if ('error' in g) return g.error
  const { session } = g

  const rows = await prisma.followUp.findMany({
    where: { organizationId: session.user.organizationId, ownerId: session.user.id },
    include: {
      company: { select: { name: true } },
      contact: { select: { name: true } },
      deal: { select: { name: true } },
      lead: { select: { name: true } },
    },
    orderBy: { dueDate: 'asc' },
    take: 200,
  })

  return NextResponse.json({
    followUps: rows.map((f) => ({
      id: f.id,
      title: f.title,
      description: f.description,
      dueDate: f.dueDate.toISOString(),
      priority: f.priority,
      status: f.status,
      createdAt: f.createdAt.toISOString(),
      updatedAt: f.updatedAt.toISOString(),
      company: f.company?.name ?? null,
      contact: f.contact?.name ?? null,
      deal: f.deal?.name ?? null,
      lead: f.lead?.name ?? null,
    })),
  })
}

/** Create a follow-up from the mobile app (e.g., after a completed visit). */
export async function POST(request: Request) {
  const g = await mobileGuard('field_visits.create', { key: 'mobile-followup-create', max: 30, windowSec: 60 })
  if ('error' in g) return g.error
  const { session } = g

  const body = await request.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    const fe: Record<string, string> = {}
    for (const i of parsed.error.issues) fe[String(i.path[0])] = i.message
    return badRequest('Invalid follow-up', fe)
  }
  const d = parsed.data

  const existingCompany = d.companyId
    ? await prisma.company.findFirst({ where: { id: d.companyId, organizationId: session.user.organizationId }, select: { id: true } })
    : null
  const existingContact = d.contactId
    ? await prisma.contact.findFirst({ where: { id: d.contactId, organizationId: session.user.organizationId }, select: { id: true } })
    : null
  const existingDeal = d.dealId
    ? await prisma.deal.findFirst({ where: { id: d.dealId, organizationId: session.user.organizationId }, select: { id: true } })
    : null
  const existingLead = d.leadId
    ? await prisma.lead.findFirst({ where: { id: d.leadId, organizationId: session.user.organizationId }, select: { id: true } })
    : null

  const followUp = await prisma.followUp.create({
    data: {
      title: d.title,
      description: d.description || null,
      dueDate: new Date(d.dueDate),
      priority: d.priority,
      organizationId: session.user.organizationId,
      ownerId: session.user.id,
      companyId: existingCompany?.id ?? null,
      contactId: existingContact?.id ?? null,
      dealId: existingDeal?.id ?? null,
      leadId: existingLead?.id ?? null,
    },
    select: { id: true },
  })

  return NextResponse.json({ id: followUp.id }, { status: 201 })
}
