import 'server-only'
import { prisma } from '@/lib/db'
import { requireApiSession } from '@/lib/session'
import { ok, err, Result } from '@/lib/result'

export interface RoleRow {
  id: string
  name: string
  description: string | null
  isSystem: boolean
  userCount: number
  permissionCount: number
}

export async function getRoles(): Promise<Result<RoleRow[]>> {
  const session = await requireApiSession()
  if (!(session.user.permissions as string[]).includes('roles.view')) return err('Forbidden: missing roles.view')

  const roles = await prisma.role.findMany({
    include: { _count: { select: { users: true, permissions: true } } },
    orderBy: { name: 'asc' },
  })

  return ok(roles.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    isSystem: r.isSystem,
    userCount: r._count.users,
    permissionCount: r._count.permissions,
  })))
}

export interface RoleDetail {
  id: string
  name: string
  description: string | null
  grantedPermissionIds: Set<string>
}

export async function getRoleById(id: string): Promise<Result<RoleDetail | null>> {
  const session = await requireApiSession()
  if (!(session.user.permissions as string[]).includes('roles.view')) return err('Forbidden: missing roles.view')

  const role = await prisma.role.findUnique({
    where: { id },
    include: { permissions: { select: { permissionId: true } } },
  })
  if (!role) return ok(null)

  return ok({
    id: role.id,
    name: role.name,
    description: role.description,
    grantedPermissionIds: new Set(role.permissions.map((p) => p.permissionId)),
  })
}

export async function getAllPermissions(): Promise<Result<Awaited<ReturnType<typeof prisma.permission.findMany>>>> {
  await requireApiSession()
  const permissions = await prisma.permission.findMany({ orderBy: [{ category: 'asc' }, { name: 'asc' }] })
  return ok(permissions)
}
