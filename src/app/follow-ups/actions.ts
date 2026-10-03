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

const linkTypeSchema = z.enum(['none', 'lead', 'company', 'deal'])

const followUpSchema = z.object({
  title: z.string().trim().min(2, 'Title is required'),
  description: z.string().trim().optional(),
  dueDate: z.string().trim().min(1, 'Due date is required'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
  linkType: linkTypeSchema.optional(),
  linkId: z.string().trim().optional(),
})

export interface FollowUpFormState {
  error?: string
  fieldErrors?: Record<string, string>
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

  await prisma.followUp.create({
    data: {
      title: data.title,
      description: data.description || null,
      dueDate: new Date(data.dueDate),
      priority: data.priority ?? 'MEDIUM',
      status: 'PENDING',
      organizationId: session.user.organizationId,
      ownerId: session.user.id,
      leadId: data.linkType === 'lead' ? data.linkId || null : null,
      companyId: data.linkType === 'company' ? data.linkId || null : null,
      dealId: data.linkType === 'deal' ? data.linkId || null : null,
    },
  })

  revalidatePath('/follow-ups')
  revalidatePath('/dashboard')
  return {}
}

export async function completeFollowUpAction(id: string): Promise<void> {
  await validateCsrf()
  const session = await assertPermission(PERMISSIONS['leads.update'].name)
  await prisma.followUp.updateMany({
    where: { id, organizationId: session.user.organizationId },
    data: { status: 'COMPLETED', completedAt: new Date() },
  })
  revalidatePath('/follow-ups')
  revalidatePath('/dashboard')
}

export async function reopenFollowUpAction(id: string): Promise<void> {
  await validateCsrf()
  const session = await assertPermission(PERMISSIONS['leads.update'].name)
  await prisma.followUp.updateMany({
    where: { id, organizationId: session.user.organizationId },
    data: { status: 'PENDING', completedAt: null },
  })
  revalidatePath('/follow-ups')
  revalidatePath('/dashboard')
}

export async function deleteFollowUpAction(id: string): Promise<void> {
  await validateCsrf()
  const session = await assertPermission(PERMISSIONS['leads.update'].name)
  await prisma.followUp.deleteMany({ where: { id, organizationId: session.user.organizationId } })
  revalidatePath('/follow-ups')
  revalidatePath('/dashboard')
}
