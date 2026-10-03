/**
 * Grant the Sales Product Tracking permissions to existing organisations.
 *
 * Adding entries to src/lib/permissions-data.ts is not enough on its own:
 * `Permission` and `RolePermission` rows live in the database, and the only
 * automatic seeder (`prisma/seed.ts`) bails out early when the organisation
 * slug already exists. This script closes that gap for deployments that are
 * already live.
 *
 * It calls the exact same idempotent helper the app uses
 * (`ensureRolesAndPermissionsSeeded`, src/lib/rbac-seed.ts), which:
 *   - upserts every Permission row (description + category refreshed),
 *   - upserts the RolePermission grants declared in ROLE_PERMISSIONS,
 *   - deletes stale grants so removals from ROLE_PERMISSIONS take effect.
 *
 * Safe to run repeatedly: no rows are duplicated and no rows are removed that
 * ROLE_PERMISSIONS still declares. Roles/Permissions are global in this schema,
 * so a single run updates every organisation at once.
 *
 * Flags:
 *   --dry-run   List the Sales permissions and the role grants that would be
 *               written, without touching the database.
 *
 * Usage:
 *   npx tsx prisma/scripts/sync-sales-permissions.ts
 *   npx tsx prisma/scripts/sync-sales-permissions.ts --dry-run
 *   npm run db:sync-sales-permissions
 */
import { createScriptPrismaClient } from './_client'
import { ensureRolesAndPermissionsSeeded } from '../../src/lib/rbac-seed'
import { PERMISSIONS, ROLE_PERMISSIONS, type PermissionKey } from '../../src/lib/permissions-data'

const prisma = createScriptPrismaClient()

const SALES_PREFIXES = ['sales.', 'products.']

function salesPermissions(): PermissionKey[] {
  return (Object.keys(PERMISSIONS) as PermissionKey[]).filter((key) =>
    SALES_PREFIXES.some((prefix) => key.startsWith(prefix))
  )
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const keys = salesPermissions()

  console.log(`[sales-perms] ${keys.length} Sales permissions declared in permissions-data.ts`)

  for (const key of keys) {
    const granted = (Object.entries(ROLE_PERMISSIONS) as Array<[string, PermissionKey[]]>)
      .filter(([, perms]) => perms.includes(key))
      .map(([role]) => role)
      .sort()
    console.log(`[sales-perms]   ${key} -> ${granted.join(', ') || '(nobody)'}`)
  }

  if (dryRun) {
    console.log('[sales-perms] DRY RUN — no writes performed.')
    await prisma.$disconnect()
    return
  }

  await ensureRolesAndPermissionsSeeded(prisma)

  // Report the resulting state so the operator can eyeball it without a query.
  const permissions = await prisma.permission.findMany({
    where: { name: { in: keys as string[] } },
    select: { name: true },
    orderBy: { name: 'asc' },
  })
  const grants = await prisma.rolePermission.count({
    where: { permission: { name: { in: keys as string[] } } },
  })
  const organizations = await prisma.organization.count()

  console.log(`[sales-perms] ✅ ${permissions.length} Sales permission rows present, ${grants} role grants total.`)
  console.log(`[sales-perms] ${organizations} organisation(s) now resolve these permissions through getUserPermissions().`)
  console.log(
    '[sales-perms] Roles/Permissions are global, so every organisation was updated by this single run.'
  )

  await prisma.$disconnect()
}

main().catch((err) => {
  console.error('[sales-perms] Error:', err)
  process.exit(1)
})
