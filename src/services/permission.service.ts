import 'server-only'
import { prisma } from '@/lib/db'

/**
 * Source of truth for authorization. Every Server Action and Route
 * Handler that touches protected data must call requirePermission()
 * (or hasPermission()) from here — never trust a client-side check
 * (src/lib/permissions.ts::usePermissions) for anything but UI hints.
 *
 * Resolves a user's permissions via their assigned roles, scoped to
 * their organization, so cross-organization access is structurally
 * impossible: the query below is filtered on `user.organizationId`,
 * not on an organizationId supplied by the caller.
 */
export async function getUserPermissions(userId: string, organizationId: string): Promise<string[]> {
  const userRoles = await prisma.userRole.findMany({
    where: {
      userId,
      user: {
        organizationId,
      },
    },
    include: {
      role: {
        include: {
          permissions: {
            include: {
              permission: true,
            },
          },
        },
      },
    },
  })

  const permissions = new Set<string>()
  for (const userRole of userRoles) {
    for (const rp of userRole.role.permissions) {
      permissions.add(rp.permission.name)
    }
  }

  return Array.from(permissions)
}

export async function hasPermission(userId: string, organizationId: string, permission: string): Promise<boolean> {
  const permissions = await getUserPermissions(userId, organizationId)
  return (permissions as string[]).includes(permission)
}

export async function hasAnyPermission(userId: string, organizationId: string, permissionList: string[]): Promise<boolean> {
  const permissions = await getUserPermissions(userId, organizationId)
  return permissionList.some((permission) => (permissions as string[]).includes(permission))
}

/** Throws (never returns false) so callers can use it as a guard clause. */
export async function requirePermission(userId: string, organizationId: string, permission: string): Promise<void> {
  const hasAccess = await hasPermission(userId, organizationId, permission)
  if (!hasAccess) {
    throw new Error(`Permission denied: ${permission}`)
  }
}
