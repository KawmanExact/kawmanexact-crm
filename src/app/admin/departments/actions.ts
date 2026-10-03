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
  managerId: z.string().trim().optional(),
})

export interface DeptFormState {
  error?: string
  fieldErrors?: Record<string, string>
  success?: boolean
}

async function assertPermission() {
  const session = await requireApiSession()
  if (!(session.user.permissions as string[]).includes('organizations.update')) throw new Error('You do not have permission to do this.')
  return session
}

export async function createDepartmentAction(_prev: DeptFormState, formData: FormData): Promise<DeptFormState> {
  await validateCsrf()
  const session = await assertPermission()
  const parsed = schema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] = issue.message
    return { fieldErrors }
  }
  const data = parsed.data

  const dupe = await prisma.department.findFirst({ where: { organizationId: session.user.organizationId, name: data.name } })
  if (dupe) return { fieldErrors: { name: 'A department with this name already exists' } }

  const dept = await prisma.department.create({
    data: {
      name: data.name,
      description: data.description || null,
      managerId: data.managerId || null,
      organizationId: session.user.organizationId,
    },
  })

  await logAudit({
    organizationId: session.user.organizationId,
    actorId: session.user.id,
    action: 'ADMIN_CHANGES',
    resource: 'department',
    resourceId: dept.id,
    metadata: { event: 'department_created', name: dept.name },
  })

  revalidatePath('/admin/departments')
  return { success: true }
}

export async function deleteDepartmentAction(id: string): Promise<void> {
  await validateCsrf()
  const session = await assertPermission()
  const existing = await prisma.department.findFirst({ where: { id, organizationId: session.user.organizationId } })
  if (!existing) return
  await prisma.department.delete({ where: { id } })
  await logAudit({
    organizationId: session.user.organizationId,
    actorId: session.user.id,
    action: 'ADMIN_CHANGES',
    resource: 'department',
    resourceId: id,
    metadata: { event: 'department_deleted', name: existing.name },
  })
  revalidatePath('/admin/departments')
}
