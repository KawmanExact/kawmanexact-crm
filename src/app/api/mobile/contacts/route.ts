import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { logAudit } from '@/lib/audit-log'
import { mobileGuard, badRequest } from '@/lib/mobile-api'
import { buildContactEmailKey, duplicateContactEmailMessage } from '@/lib/contact-dedupe'
import { findOrCreateCompanyByName } from '@/services/company.service'

/**
 * Saves a business-card contact AFTER the rep has reviewed/edited the OCR
 * result in the app. The scan itself uses the existing POST /api/contacts/scan.
 * Mirrors scanAndCreateContactAction in src/app/contacts/actions.ts.
 */
const schema = z.object({
  name: z.string().trim().min(2, 'Name is required'),
  company: z.string().trim().optional(),
  designation: z.string().trim().optional(),
  email: z.string().trim().email().optional().or(z.literal('')),
  phone: z.string().trim().optional(),
  mobile: z.string().trim().optional(),
  address: z.string().trim().optional(),
})

export async function POST(request: Request) {
  const g = await mobileGuard('contacts.create', { key: 'mobile-contact', max: 30, windowSec: 60 })
  if ('error' in g) return g.error
  const { session } = g

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    const fe: Record<string, string> = {}
    for (const i of parsed.error.issues) fe[String(i.path[0])] = i.message
    return badRequest('Invalid contact', fe)
  }
  const d = parsed.data
  const orgId = session.user.organizationId

  const company = d.company
    ? await findOrCreateCompanyByName({ name: d.company, organizationId: orgId, ownerId: session.user.id })
    : null

  const email = d.email || null
  const emailKey = buildContactEmailKey(email)
  if (emailKey) {
    const dup = await prisma.contact.findFirst({
      where: { organizationId: orgId, emailKey },
      select: { name: true },
    })
    if (dup) return NextResponse.json({ error: duplicateContactEmailMessage(dup.name) }, { status: 409 })
  }

  const contact = await prisma.contact.create({
    data: {
      name: d.name,
      designation: d.designation || null,
      email,
      phone: d.phone || null,
      mobile: d.mobile || null,
      address: d.address || null,
      companyId: company?.id ?? null,
      organizationId: orgId,
      ownerId: session.user.id,
      lastActivityAt: new Date(),
      emailKey,
    },
    select: { id: true, name: true },
  })

  await prisma.activity.create({
    data: {
      type: 'CONTACT_CREATED',
      description: `${session.user.name} added contact "${contact.name}" via Kawman Field app (business card scan)`,
      organizationId: orgId,
      actorId: session.user.id,
      contactId: contact.id,
      companyId: company?.id ?? null,
    },
  })
  await logAudit({
    organizationId: orgId,
    actorId: session.user.id,
    action: 'CREATE',
    resource: 'Contact',
    resourceId: contact.id,
    metadata: { name: contact.name, companyId: company?.id ?? null, source: 'mobile_business_card_scan' },
  })

  return NextResponse.json({ id: contact.id }, { status: 201 })
}
