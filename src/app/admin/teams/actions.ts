'use server'

import { validateCsrf } from '@/lib/csrf'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/db'
import { requireApiSession } from '@/lib/session'
import { logAudit } from '@/lib/audit-log'

const schema = z.object({
  name: z.string().trim().min(2, 'Name is required'),
  description: z.string().trim().optional(),
  departmentId: z.string().trim().optional(),
  managerId: z.string().trim().optional(),
})

export interface TeamFormState {
  error?: string
  fieldErrors?: Record<string, string>
  success?: boolean
}

async function assertPermission() {
  const session = await requireApiSession()
  if (!(session.user.permissions as string[]).includes('organizations.update')) throw new Error('You do not have permission to do this.')
  return session
}

export async function createTeamAction(_prev: TeamFormState, formData: FormData): Promise<TeamFormState> {
  await validateCsrf()
  const session = await assertPermission()
  const parsed = schema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] = issue.message
    return { fieldErrors }
  }
  const data = parsed.data

  const dupe = await prisma.team.findFirst({ where: { organizationId: session.user.organizationId, name: data.name } })
  if (dupe) return { fieldErrors: { name: 'A team with this name already exists' } }

  const team = await prisma.team.create({
    data: {
      name: data.name,
      description: data.description || null,
      departmentId: data.departmentId || null,
      managerId: data.managerId || null,
      organizationId: session.user.organizationId,
    },
  })

  await logAudit({
    organizationId: session.user.organizationId,
    actorId: session.user.id,
    action: 'ADMIN_CHANGES',
    resource: 'team',
    resourceId: team.id,
    metadata: { event: 'team_created', name: team.name },
  })

  revalidatePath('/admin/teams')
  return { success: true }
}

export async function deleteTeamAction(id: string): Promise<void> {
  await validateCsrf()
  const session = await assertPermission()
  const existing = await prisma.team.findFirst({ where: { id, organizationId: session.user.organizationId } })
  if (!existing) return
  await prisma.team.delete({ where: { id } })
  await logAudit({
    organizationId: session.user.organizationId,
    actorId: session.user.id,
    action: 'ADMIN_CHANGES',
    resource: 'team',
    resourceId: id,
    metadata: { event: 'team_deleted', name: existing.name },
  })
  revalidatePath('/admin/teams')
}
