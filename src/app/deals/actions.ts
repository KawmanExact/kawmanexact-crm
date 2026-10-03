'use server'

import { validateCsrf } from '@/lib/csrf'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/db'
import { requireApiSession } from '@/lib/session'
import { PERMISSIONS } from '@/lib/permissions-data'
import { logAudit } from '@/lib/audit-log'
import { canManageAssignments } from '@/lib/record-scope'
import { findOrCreateCompanyByName } from '@/services/company.service'
import { findOrCreateContactByName } from '@/services/contact.service'

const STAGES = ['NEW_LEAD', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST'] as const

const dealSchema = z.object({
  name: z.string().trim().min(2, 'Deal name is required'),
  company: z.string().trim().optional(),
  contactName: z.string().trim().optional(),
  contactEmail: z.string().trim().email('Enter a valid email').optional().or(z.literal('')),
  contactMobile: z.string().trim().optional(),
  value: z.coerce.number().min(0, 'Value must be positive'),
  probability: z.coerce.number().int().min(0).max(100).optional(),
  stage: z.enum(STAGES).optional(),
  expectedClose: z.string().trim().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
  segment: z.string().trim().optional(),
  ownerId: z.string().trim().optional(),
}).refine(
  (data) => {
    const email = data.contactEmail || ''
    const mobile = data.contactMobile || ''
    if (!email.trim() && !mobile.trim()) return true
    return Boolean((data.contactName || '').trim())
  },
  { message: 'Contact name is required when contact email or mobile is provided', path: ['contactName'] },
)

export interface DealFormState {
  error?: string
  fieldErrors?: Record<string, string>
  success?: boolean
  createdId?: string
}

async function assertPermission(permission: string) {
  const session = await requireApiSession()
  if (!(session.user.permissions as string[]).includes(permission)) throw new Error('You do not have permission to do this.')
  return session
}

export async function createDealAction(_prev: DealFormState, formData: FormData): Promise<DealFormState> {
  await validateCsrf()
  const session = await assertPermission(PERMISSIONS['deals.create'].name)
  const parsed = dealSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] = issue.message
    return { fieldErrors }
  }
  const data = parsed.data
  if (!canManageAssignments(session.user)) data.ownerId = session.user.id

  const company = data.company?.trim()
    ? await findOrCreateCompanyByName({
        name: data.company.trim(),
        organizationId: session.user.organizationId,
        ownerId: data.ownerId || session.user.id,
      })
    : null
  const companyId = company?.id ?? null
  const contact = data.contactName?.trim()
    ? await findOrCreateContactByName({
        email: data.contactEmail || null,
        mobile: data.contactMobile || null,
        name: data.contactName.trim(),
        organizationId: session.user.organizationId,
        ownerId: data.ownerId || session.user.id,
        companyId,
      })
    : null
  const contactId = contact?.id ?? null

  const deal = await prisma.deal.create({
    data: {
      name: data.name,
      value: data.value,
      probability: data.probability ?? 20,
      stage: data.stage ?? 'NEW_LEAD',
      expectedClose: data.expectedClose ? new Date(data.expectedClose) : null,
      priority: data.priority ?? 'MEDIUM',
      segment: data.segment || null,
      companyId,
      contactId,
      organizationId: session.user.organizationId,
      ownerId: data.ownerId || session.user.id,
      closedAt: data.stage === 'WON' || data.stage === 'LOST' ? new Date() : null,
    },
  })
  await prisma.activity.create({
    data: {
      type: 'DEAL_CREATED',
      description: `${session.user.name} created deal "${deal.name}"`,
      organizationId: session.user.organizationId,
      actorId: session.user.id,
      dealId: deal.id,
      companyId,
    },
  })

  await logAudit({
    organizationId: session.user.organizationId,
    actorId: session.user.id,
    action: 'CREATE',
    resource: 'Deal',
    resourceId: deal.id,
    metadata: { name: deal.name, value: deal.value, stage: deal.stage },
  })

  revalidatePath('/deals')
  revalidatePath('/dashboard')
  return { success: true, createdId: deal.id }
}

export async function updateDealAction(id: string, _prev: DealFormState, formData: FormData): Promise<DealFormState> {
  await validateCsrf()
  const session = await assertPermission(PERMISSIONS['deals.update'].name)
  const parsed = dealSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] = issue.message
    return { fieldErrors }
  }
  const data = parsed.data
  if (!canManageAssignments(session.user)) data.ownerId = session.user.id

  const existing = await prisma.deal.findFirst({ where: { id, organizationId: session.user.organizationId } })
  if (!existing) return { error: 'Deal not found.' }

  const company = data.company?.trim()
    ? await findOrCreateCompanyByName({
        name: data.company.trim(),
        organizationId: session.user.organizationId,
        ownerId: data.ownerId || existing.ownerId,
      })
    : null
  const rawCompany = formData.get('company')
  const companyId = rawCompany !== null ? (company?.id ?? null) : existing.companyId
  const contact = data.contactName?.trim()
    ? await findOrCreateContactByName({
        email: data.contactEmail || null,
        mobile: data.contactMobile || null,
        name: data.contactName.trim(),
        organizationId: session.user.organizationId,
        ownerId: data.ownerId || existing.ownerId,
        companyId,
      })
    : null
  const rawContact = formData.get('contactName')
  const contactId = rawContact !== null ? (contact?.id ?? null) : existing.contactId
  const notes = formData.get('notes')

  await prisma.deal.update({
    where: { id },
    data: {
      name: data.name,
      value: data.value,
      probability: data.probability ?? existing.probability,
      stage: data.stage ?? existing.stage,
      expectedClose: data.expectedClose ? new Date(data.expectedClose) : null,
      priority: data.priority ?? existing.priority,
      segment: data.segment || null,
      companyId,
      contactId,
      ownerId: data.ownerId || existing.ownerId,
      notes: typeof notes === 'string' && notes.trim() ? notes.trim() : existing.notes,
      closedAt: data.stage === 'WON' || data.stage === 'LOST' ? (existing.closedAt ?? new Date()) : null,
    },
  })

  if (data.stage && data.stage !== existing.stage) {
    await prisma.activity.create({
      data: {
        type: 'DEAL_UPDATED',
        description: `${session.user.name} moved "${existing.name}" to ${data.stage.replace('_', ' ')}`,
        organizationId: session.user.organizationId,
        actorId: session.user.id,
        dealId: id,
      },
    })
  }

  await logAudit({
    organizationId: session.user.organizationId,
    actorId: session.user.id,
    action: 'UPDATE',
    resource: 'Deal',
    resourceId: id,
    metadata: { name: data.name, changes: Object.keys(data) },
  })

  revalidatePath('/deals')
  revalidatePath(`/deals/${id}`)
  revalidatePath('/dashboard')
  return { success: true }
}

/** Called from the kanban board on drag-and-drop — updates just the stage. */
export async function updateDealStageAction(dealId: string, stage: (typeof STAGES)[number]): Promise<void> {
  await validateCsrf()
  const session = await assertPermission(PERMISSIONS['deals.update'].name)
  const deal = await prisma.deal.findFirst({ where: { id: dealId, organizationId: session.user.organizationId } })
  if (!deal || deal.stage === stage) return

  await prisma.deal.update({
    where: { id: dealId },
    data: {
      stage,
      closedAt: stage === 'WON' || stage === 'LOST' ? new Date() : null,
    },
  })
  await prisma.activity.create({
    data: {
      type: 'DEAL_UPDATED',
      description: `${session.user.name} moved "${deal.name}" to ${stage.replace('_', ' ')}`,
      organizationId: session.user.organizationId,
      actorId: session.user.id,
      dealId,
    },
  })

  await logAudit({
    organizationId: session.user.organizationId,
    actorId: session.user.id,
    action: 'UPDATE',
    resource: 'Deal',
    resourceId: dealId,
    metadata: { name: deal.name, stage, previousStage: deal.stage },
  })

  revalidatePath('/deals')
  revalidatePath('/dashboard')
}

export async function deleteDealAction(id: string): Promise<{ success?: boolean; error?: string }> {
  await validateCsrf()
  const session = await assertPermission(PERMISSIONS['deals.delete'].name)
  const existing = await prisma.deal.findFirst({ where: { id, organizationId: session.user.organizationId } })
  if (!existing) return { error: 'Deal not found.' }
  await prisma.deal.delete({ where: { id } })

  await logAudit({
    organizationId: session.user.organizationId,
    actorId: session.user.id,
    action: 'DELETE',
    resource: 'Deal',
    resourceId: id,
    metadata: { name: existing.name },
  })

  revalidatePath('/deals')
  revalidatePath('/dashboard')
  return { success: true }
}
