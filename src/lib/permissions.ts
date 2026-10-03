// Client-safe permission helpers. This file must NEVER import './db'
// (Prisma) — it is imported from Client Components (e.g. the sidebar)
// to decide what to render. DB-backed permission lookups (resolving a
// user's actual granted permissions from the database) live in
// services/permission.service.ts instead.

'use client'

import { useMemo } from 'react'
import { useSession } from '@/lib/auth-client'
import { PERMISSIONS, ROLE_PERMISSIONS, type PermissionKey } from '@/lib/permissions-data'

export { PERMISSIONS, ROLE_PERMISSIONS }
export type { PermissionKey }

/**
 * Pure helper: does this role (as a static role→permission map) grant
 * the given permission? This is a fallback/UI-hint check only — the
 * database is always the source of truth for a real user's granted
 * permissions (see services/permission.service.ts::hasPermission),
 * since custom roles and per-user permission overrides aren't
 * representable in this static map.
 */
export function roleHasPermission(role: string, permission: string): boolean {
  const granted = ROLE_PERMISSIONS[role]
  return granted ? (granted as string[]).includes(permission) : false
}

/**
 * Client-side hook for UI decisions only (e.g. hiding a nav section).
 * Reads the permission list the server resolved fresh from the DB and
 * attached to the session via the customSession plugin (see
 * lib/auth.ts). This NEVER replaces server-side enforcement — every
 * Server Action / route handler must still call requirePermission()
 * from lib/session.ts or services/permission.service.ts.
 */
export function usePermissions() {
  const { data: session } = useSession()
  const user = session?.user

  return useMemo(() => {
    const granted = new Set(user?.permissions ?? [])

    return {
      permissions: Array.from(granted),
      hasPermission: (permission: string) => granted.has(permission),
      hasAnyPermission: (permissionList: string[]) =>
        permissionList.some((permission) => granted.has(permission)),
      hasAllPermissions: (permissionList: string[]) =>
        permissionList.every((permission) => granted.has(permission)),
    }
  }, [user])
}
