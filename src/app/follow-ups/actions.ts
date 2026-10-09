'use server'

import { validateCsrf } from '@/lib/csrf'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/db'
import { requireApiSession } from '@/lib/session'
import { PERMISSIONS } from '@/lib/permissions-data'

async function assertPermission(permission: string) {
  const session = await requireApiSession()
  if (!(session.user.permissions as string[]).includes(permission)) {
    throw new Error('You do not have permission to do this.')
  }
  return session
}

const followUpSchema = z.object({
  title: z.string().trim().min(2, 'Title is required'),
  description: z.string().trim().optional(),
  dueDate: z.string().trim().min(1, 'Due date is required'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
  companyId: z.string().trim().optional(),
  contactId: z.string().trim().optional(),
  dealId: z.string().trim().optional(),
})

export interface FollowUpFormState {
  error?: string
  fieldErrors?: Record<string, string>
}

/**
 * Derive missing parent IDs from the lowest-level link provided.
 * Priority: deal > contact > company
 * - If dealId: fetch deal, use its contactId and companyId (ignore client-supplied)
 * - Else if contactId: fetch contact, use its companyId (ignore client-supplied)
 * - Else if companyId: use as-is
 * All IDs must belong to the user's organization.
 * A contact must belong to the chosen company (if both provided).
 */
async function deriveParentIds(
  session: Awaited<ReturnType<typeof requireApiSession>>,
  input: { companyId?: string | null; contactId?: string | null; dealId?: string | null }
): Promise<{ companyId: string | null; contactId: string | null; dealId: string | null }> {
  const orgId = session.user.organizationId
  let { companyId, contactId, dealId } = input

  // Verify all provided IDs belong to the organization
  if (dealId) {
    const deal = await prisma.deal.findFirst({
      where: { id: dealId, organizationId: orgId },
      select: { id: true, contactId: true, companyId: true },
    })
    if (!deal) throw new Error('Deal not found or access denied')
    // Server-side derivation: always use deal's contact/company, never trust client
    contactId = deal.contactId ?? null
    companyId = deal.companyId ?? null
    dealId = deal.id
  } else if (contactId) {
    const contact = await prisma.contact.findFirst({
      where: { id: contactId, organizationId: orgId },
      select: { id: true, companyId: true },
    })
    if (!contact) throw new Error('Contact not found or access denied')
    // If client also provided a companyId, verify the contact belongs to it
    if (input.companyId && contact.companyId !== input.companyId) {
      throw new Error('Contact does not belong to the selected company')
    }
    // Server-side derivation: use contact's company
    companyId = contact.companyId ?? null
    contactId = contact.id
    dealId = null
  } else if (companyId) {
    const company = await prisma.company.findFirst({
      where: { id: companyId, organizationId: orgId },
      select: { id: true },
    })
    if (!company) throw new Error('Company not found or access denied')
    companyId = company.id
    contactId = null
    dealId = null
  } else {
    // No link provided
    companyId = null
    contactId = null
    dealId = null
  }

  // Cross-check: if both companyId and contactId are set, contact must belong to company
  if (companyId && contactId) {
    const contact = await prisma.contact.findFirst({
      where: { id: contactId, organizationId: orgId },
      select: { companyId: true },
    })
    if (!contact || contact.companyId !== companyId) {
      throw new Error('Contact does not belong to the selected company')
    }
  }

  return { companyId, contactId, dealId }
}

/**
 * Recompute Deal.nextFollowUp as the earliest PENDING dueDate for that deal.
 * Called after any follow-up mutation that could affect the next follow-up date.
 * Exported so deal create/update actions can sync the column after touching FollowUp rows.
 */
export async function recomputeDealNextFollowUp(dealId: string | null, organizationId: string) {
  if (!dealId) return

  const nextPending = await prisma.followUp.findFirst({
    where: {
      dealId,
      organizationId,
      status: 'PENDING',
    },
    orderBy: { dueDate: 'asc' },
    select: { dueDate: true },
  })

  await prisma.deal.update({
    where: { id: dealId },
    data: { nextFollowUp: nextPending?.dueDate ?? null },
  })
}

export async function createFollowUpAction(
  _prev: FollowUpFormState,
  formData: FormData
): Promise<FollowUpFormState> {
  await validateCsrf()
  const session = await assertPermission(PERMISSIONS['leads.update'].name)
  const parsed = followUpSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] = issue.message
    return { fieldErrors }
  }
  const data = parsed.data

  // Derive parent IDs server-side
  const { companyId, contactId, dealId } = await deriveParentIds(session, {
    companyId: data.companyId || null,
    contactId: data.contactId || null,
    dealId: data.dealId || null,
  })

  await prisma.followUp.create({
    data: {
      title: data.title,
      description: data.description || null,
      dueDate: new Date(data.dueDate),
      priority: data.priority ?? 'MEDIUM',
      status: 'PENDING',
      organizationId: session.user.organizationId,
      ownerId: session.user.id,
      companyId,
      contactId,
      dealId,
    },
  })

  // Recompute nextFollowUp on the deal if linked
  await recomputeDealNextFollowUp(dealId, session.user.organizationId)

  revalidatePath('/follow-ups')
  revalidatePath('/dashboard')
  if (dealId) revalidatePath(`/deals/${dealId}`)
  if (contactId) revalidatePath(`/contacts/${contactId}`)
  if (companyId) revalidatePath(`/companies/${companyId}`)
  return {}
}

export async function completeFollowUpAction(id: string): Promise<void> {
  await validateCsrf()
  const session = await assertPermission(PERMISSIONS['leads.update'].name)
  const followUp = await prisma.followUp.updateMany({
    where: { id, organizationId: session.user.organizationId },
    data: { status: 'COMPLETED', completedAt: new Date() },
  })

  // Recompute nextFollowUp on the deal if this follow-up was linked to a deal
  if (followUp.count > 0) {
    const fu = await prisma.followUp.findUnique({ where: { id, organizationId: session.user.organizationId }, select: { dealId: true } })
    await recomputeDealNextFollowUp(fu?.dealId ?? null, session.user.organizationId)
  }

  revalidatePath('/follow-ups')
  revalidatePath('/dashboard')
}

export async function reopenFollowUpAction(id: string): Promise<void> {
  await validateCsrf()
  const session = await assertPermission(PERMISSIONS['leads.update'].name)
  const followUp = await prisma.followUp.updateMany({
    where: { id, organizationId: session.user.organizationId },
    data: { status: 'PENDING', completedAt: null },
  })

  // Recompute nextFollowUp on the deal if this follow-up was linked to a deal
  if (followUp.count > 0) {
    const fu = await prisma.followUp.findUnique({ where: { id, organizationId: session.user.organizationId }, select: { dealId: true } })
    await recomputeDealNextFollowUp(fu?.dealId ?? null, session.user.organizationId)
  }

  revalidatePath('/follow-ups')
  revalidatePath('/dashboard')
}

export async function cancelFollowUpAction(id: string): Promise<void> {
  await validateCsrf()
  const session = await assertPermission(PERMISSIONS['leads.update'].name)
  const followUp = await prisma.followUp.updateMany({
    where: { id, organizationId: session.user.organizationId },
    data: { status: 'CANCELLED' },
  })

  // Recompute nextFollowUp on the deal if this follow-up was linked to a deal
  if (followUp.count > 0) {
    const fu = await prisma.followUp.findUnique({ where: { id }, select: { dealId: true } })
    await recomputeDealNextFollowUp(fu?.dealId ?? null, session.user.organizationId)
  }

  revalidatePath('/follow-ups')
  revalidatePath('/dashboard')
}

export async function deleteFollowUpAction(id: string): Promise<void> {
  await validateCsrf()
  const session = await assertPermission(PERMISSIONS['leads.update'].name)
  const fu = await prisma.followUp.findUnique({
    where: { id, organizationId: session.user.organizationId },
    select: { dealId: true },
  })
  await prisma.followUp.deleteMany({ where: { id, organizationId: session.user.organizationId } })

  // Recompute nextFollowUp on the deal if this follow-up was linked to a deal
  await recomputeDealNextFollowUp(fu?.dealId ?? null, session.user.organizationId)

  revalidatePath('/follow-ups')
  revalidatePath('/dashboard')
}
