import { describe, it, expect } from 'vitest'
import { roleHasPermission, PERMISSIONS, ROLE_PERMISSIONS } from './permissions'

describe('roleHasPermission', () => {
  it('returns true when role has the permission', () => {
    expect(roleHasPermission('SUPER_ADMIN', 'users.create')).toBe(true)
    expect(roleHasPermission('ADMIN', 'users.create')).toBe(true)
    expect(roleHasPermission('MANAGER', 'leads.create')).toBe(true)
    expect(roleHasPermission('SALES_EXECUTIVE', 'leads.create')).toBe(true)
    expect(roleHasPermission('VIEWER', 'leads.view')).toBe(true)
  })

  it('returns false when role does not have the permission', () => {
    expect(roleHasPermission('VIEWER', 'users.create')).toBe(false)
    expect(roleHasPermission('SALES_EXECUTIVE', 'users.create')).toBe(false)
    expect(roleHasPermission('MANAGER', 'roles.create')).toBe(false)
    expect(roleHasPermission('HR', 'leads.create')).toBe(false)
  })

  it('returns false for unknown role', () => {
    expect(roleHasPermission('UNKNOWN_ROLE', 'users.view')).toBe(false)
    expect(roleHasPermission('', 'users.view')).toBe(false)
  })

  it('returns false for unknown permission', () => {
    expect(roleHasPermission('SUPER_ADMIN', 'unknown.permission')).toBe(false)
    expect(roleHasPermission('ADMIN', 'invalid.permission')).toBe(false)
  })

  it('SUPER_ADMIN has all permissions', () => {
    const allPerms = Object.keys(PERMISSIONS)
    for (const perm of allPerms) {
      expect(roleHasPermission('SUPER_ADMIN', perm)).toBe(true)
    }
  })

  it('VIEWER has only read permissions', () => {
    const viewerPerms = ROLE_PERMISSIONS.VIEWER
    for (const perm of viewerPerms) {
      expect(roleHasPermission('VIEWER', perm)).toBe(true)
    }
    
    // Should not have write permissions
    expect(roleHasPermission('VIEWER', 'users.create')).toBe(false)
    expect(roleHasPermission('VIEWER', 'leads.create')).toBe(false)
    expect(roleHasPermission('VIEWER', 'deals.create')).toBe(false)
  })

  it('role hierarchy: SUPER_ADMIN > ADMIN > MANAGER > SALES_EXECUTIVE > VIEWER', () => {
    // SUPER_ADMIN has everything ADMIN has
    const adminPerms = ROLE_PERMISSIONS.ADMIN
    for (const perm of adminPerms) {
      expect(roleHasPermission('SUPER_ADMIN', perm)).toBe(true)
    }
    
    // ADMIN has everything MANAGER has (plus more)
    const managerPerms = ROLE_PERMISSIONS.MANAGER
    for (const perm of managerPerms) {
      expect(roleHasPermission('ADMIN', perm)).toBe(true)
    }
  })
})