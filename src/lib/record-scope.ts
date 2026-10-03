import 'server-only'
import type { Session } from '@/lib/auth'

/**
 * How much of the organization's data a role can see, independent of
 * whether they hold the base "X.view" permission (which only gates
 * whether the page/action is reachable at all — see
 * lib/permissions-data.ts). This is the missing piece: today every
 * CRM service function filters queries by organizationId only, so any
 * role with e.g. "leads.view" (which includes SALES_EXECUTIVE and even
 * VIEWER) receives every lead in the org, identical to what ADMIN sees.
 *
 * - 'ALL'        — SUPER_ADMIN / ADMIN: no extra filter, full org visibility.
 * - 'DEPARTMENT' — MANAGER / SALES_MANAGER: records owned by anyone in
 *                  their department (falls back to 'OWN' if they have no
 *                  department set).
 * - 'OWN'        — everyone else: only records where ownerId === user.id,
 *                  plus anything explicitly granted via ResourceGrant
 *                  (see getGrantedResourceIds below).
 */
export type RecordScope = 'ALL' | 'DEPARTMENT' | 'OWN'

const FULL_VISIBILITY_ROLES = ['SUPER_ADMIN', 'ADMIN']
const DEPARTMENT_VISIBILITY_ROLES = ['MANAGER', 'SALES_MANAGER']

/**
 * Whether the given user (by roles) is permitted to reassign records to
 * other users — i.e. change the "Assign To" dropdown on create/edit forms
 * and bulk-assign actions. Only SUPER_ADMIN / ADMIN hold this right; every
 * other role is locked to assigning the record to themselves.
 */
export function canManageAssignments(user: { roles?: string[] }): boolean {
  const userRoles = user.roles ?? []
  return userRoles.some((r) => FULL_VISIBILITY_ROLES.includes(r))
}

export function getRecordScope(user: Session['user']): RecordScope {
  const roles = user.roles ?? []
  if (roles.some((r) => FULL_VISIBILITY_ROLES.includes(r))) return 'ALL'
  if (roles.some((r) => DEPARTMENT_VISIBILITY_ROLES.includes(r))) return 'DEPARTMENT'
  return 'OWN'
}