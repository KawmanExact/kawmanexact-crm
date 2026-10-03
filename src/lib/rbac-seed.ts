// Note: no 'server-only' import here (unlike most of src/lib) — this
// helper is also called directly from prisma/seed.ts, which runs via
// tsx outside the Next.js build, where 'server-only' throws on import.
// It's still only ever invoked from Server Actions/scripts in practice.
import { prisma } from '@/lib/db'
import { PERMISSIONS, ROLE_PERMISSIONS } from '@/lib/permissions-data'
import type { RoleType } from '@/generated/prisma'

/**
 * Upserts every Permission and Role (+ their RolePermission links) from
 * the static maps in lib/permissions.ts. Roles/Permissions are global
 * (not per-organization) — see services/permission.service.ts for how
 * a *user's* granted permissions are still strictly scoped to their own
 * organizationId via UserRole -> User.organizationId.
 *
 * Safe to call on every signup: upserts are no-ops once the catalog
 * exists, so this just costs a handful of cheap queries on repeat runs
 * rather than requiring `npm run db:seed` before the app is usable.
 */
export async function ensureRolesAndPermissionsSeeded() {
  const permissionEntries = Object.values(PERMISSIONS)

  await Promise.all(
    permissionEntries.map((p) =>
      prisma.permission.upsert({
        where: { name: p.name },
        update: { description: p.description, category: p.category },
        create: { name: p.name, description: p.description, category: p.category },
      })
    )
  )

  for (const [roleName, permissionKeys] of Object.entries(ROLE_PERMISSIONS)) {
    const role = await prisma.role.upsert({
      where: { name: roleName as RoleType },
      update: {},
      create: { name: roleName as RoleType, isSystem: true, description: `${roleName} (system role)` },
    })

    const permissions = await prisma.permission.findMany({
      where: { name: { in: permissionKeys as string[] } },
      select: { id: true },
    })
    const desiredIds = permissions.map((p) => p.id)

    await Promise.all(
      permissions.map((permission) =>
        prisma.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
          update: {},
          create: { roleId: role.id, permissionId: permission.id },
        })
      )
    )

    // Remove stale permission links so role updates (e.g. revoking
    // dashboard.view from non-admin roles) are reflected in the DB
    // even when seed re-runs on an existing database.
    if (desiredIds.length > 0) {
      await prisma.rolePermission.deleteMany({
        where: { roleId: role.id, permissionId: { notIn: desiredIds } },
      })
    }
  }
}
