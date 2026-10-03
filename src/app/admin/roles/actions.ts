'use server'

import { validateCsrf } from '@/lib/csrf'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/db'
import { requireApiSession } from '@/lib/session'
import { logAudit } from '@/lib/audit-log'

export async function toggleRolePermissionAction(roleId: string, permissionId: string, grant: boolean): Promise<{ success?: boolean; error?: string }> {
  await validateCsrf()
  const session = await requireApiSession()
  if (!(session.user.permissions as string[]).includes('roles.update')) throw new Error('You do not have permission to do this.')

  if (grant) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId, permissionId } },
      update: {},
      create: { roleId, permissionId },
    })
  } else {
    await prisma.rolePermission.deleteMany({ where: { roleId, permissionId } })
  }

  await logAudit({
    organizationId: session.user.organizationId,
    actorId: session.user.id,
    action: 'PERMISSION_CHANGE',
    resource: 'role',
    resourceId: roleId,
    metadata: { permissionId, grant },
  })

  revalidatePath(`/admin/roles/${roleId}`)
  revalidatePath('/admin/roles')
  return { success: true }
}
