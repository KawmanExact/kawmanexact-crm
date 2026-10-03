// Note: no 'server-only' import here (unlike most of src/lib) — this
// helper is also called from prisma/seed.ts and prisma/scripts/*, which run
// via tsx outside the Next.js build, where 'server-only' throws on import.
// It's still only ever invoked from Server Actions/scripts in practice.
import type { prisma as PrismaClientValue } from '@/lib/db'
import { PERMISSIONS, ROLE_PERMISSIONS } from '@/lib/permissions-data'
import type { RoleType } from '@/generated/prisma'

/** The slice of PrismaClient this seeder needs, so a caller can inject a client
 * that did not come from `@/lib/db`. */
type RbacPrisma = Pick<
  typeof PrismaClientValue,
  'permission' | 'role' | 'rolePermission'
>

/**
 * Upserts every Permission and Role (+ their RolePermission links) from
 * the static maps in lib/permissions.ts. Roles/Permissions are global
 * (not per-organization) — see services/permission.service.ts for how
 * a *user's* granted permissions are still strictly scoped to their own
 * organizationId via UserRole -> User.organizationId.
 *
 * Safe to call repeatedly: upserts are no-ops once the catalog exists, and
 * stale grants are pruned, so re-running picks up added or removed
 * permissions.
 *
 * `client` exists for standalone `prisma/scripts/*` runs under tsx: importing
 * `@/lib/db` there pulls in `src/lib/logger.ts`, whose `import 'server-only'`
 * throws outside a React Server Component bundle. Passing a script-built client
 * (see prisma/scripts/_client.ts) keeps the script runnable without duplicating
 * the seeding logic. The app itself always uses the default client, which is
 * resolved with a lazy dynamic import so merely loading this module under tsx
 * does not drag in the server-only chain.
 */
export async function ensureRolesAndPermissionsSeeded(client?: RbacPrisma) {
  const db = client ?? (await import('@/lib/db')).prisma
  const permissionEntries = Object.values(PERMISSIONS)

  await Promise.all(
    permissionEntries.map((p) =>
      db.permission.upsert({
        where: { name: p.name },
        update: { description: p.description, category: p.category },
        create: { name: p.name, description: p.description, category: p.category },
      })
    )
  )

  for (const [roleName, permissionKeys] of Object.entries(ROLE_PERMISSIONS)) {
    const role = await db.role.upsert({
      where: { name: roleName as RoleType },
      update: {},
      create: { name: roleName as RoleType, isSystem: true, description: `${roleName} (system role)` },
    })

    const permissions = await db.permission.findMany({
      where: { name: { in: permissionKeys as string[] } },
      select: { id: true },
    })
    const desiredIds = permissions.map((p) => p.id)

    await Promise.all(
      permissions.map((permission) =>
        db.rolePermission.upsert({
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
      await db.rolePermission.deleteMany({
        where: { roleId: role.id, permissionId: { notIn: desiredIds } },
      })
    }
  }
}
