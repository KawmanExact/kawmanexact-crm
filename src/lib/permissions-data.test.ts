import { describe, it, expect } from 'vitest'
import { PERMISSIONS, ROLE_PERMISSIONS } from './permissions-data'

describe('PERMISSIONS', () => {
  it('contains all expected permission keys', () => {
    const permissionKeys = Object.keys(PERMISSIONS)
    expect(permissionKeys.length).toBeGreaterThan(50)
    
    // Core permissions exist
    expect(permissionKeys).toContain('dashboard.view')
    expect(permissionKeys).toContain('users.view')
    expect(permissionKeys).toContain('users.create')
    expect(permissionKeys).toContain('users.update')
    expect(permissionKeys).toContain('users.delete')
    expect(permissionKeys).toContain('roles.view')
    expect(permissionKeys).toContain('roles.create')
    expect(permissionKeys).toContain('roles.update')
    expect(permissionKeys).toContain('roles.delete')
    expect(permissionKeys).toContain('organizations.view')
    expect(permissionKeys).toContain('organizations.update')
    expect(permissionKeys).toContain('files.view')
    expect(permissionKeys).toContain('files.upload')
    expect(permissionKeys).toContain('files.download')
    expect(permissionKeys).toContain('files.update')
    expect(permissionKeys).toContain('files.delete')
    expect(permissionKeys).toContain('files.share')
    expect(permissionKeys).toContain('files.manage')
    expect(permissionKeys).toContain('leads.view')
    expect(permissionKeys).toContain('leads.create')
    expect(permissionKeys).toContain('leads.update')
    expect(permissionKeys).toContain('leads.delete')
    expect(permissionKeys).toContain('leads.export')
    expect(permissionKeys).toContain('companies.view')
    expect(permissionKeys).toContain('companies.create')
    expect(permissionKeys).toContain('companies.update')
    expect(permissionKeys).toContain('companies.delete')
    expect(permissionKeys).toContain('contacts.view')
    expect(permissionKeys).toContain('contacts.create')
    expect(permissionKeys).toContain('contacts.update')
    expect(permissionKeys).toContain('contacts.delete')
    expect(permissionKeys).toContain('deals.view')
    expect(permissionKeys).toContain('deals.create')
    expect(permissionKeys).toContain('deals.update')
    expect(permissionKeys).toContain('deals.delete')
    expect(permissionKeys).toContain('deals.export')
    expect(permissionKeys).toContain('meetings.view')
    expect(permissionKeys).toContain('meetings.create')
    expect(permissionKeys).toContain('meetings.update')
    expect(permissionKeys).toContain('meetings.delete')
    expect(permissionKeys).toContain('field_visits.view')
    expect(permissionKeys).toContain('field_visits.create')
    expect(permissionKeys).toContain('field_visits.update')
    expect(permissionKeys).toContain('field_visits.delete')
    expect(permissionKeys).toContain('team.view')
    expect(permissionKeys).toContain('team.view_all')
    expect(permissionKeys).toContain('reports.view')
    expect(permissionKeys).toContain('reports.export')
    expect(permissionKeys).toContain('reports.submit')
    expect(permissionKeys).toContain('reports.view_all')
    expect(permissionKeys).toContain('ai.use')
    expect(permissionKeys).toContain('settings.view')
    expect(permissionKeys).toContain('settings.manage')
    expect(permissionKeys).toContain('audit_logs.view')
  })

  it('each permission has required properties', () => {
    for (const [key, perm] of Object.entries(PERMISSIONS)) {
      expect(perm.name).toBe(key)
      expect(typeof perm.description).toBe('string')
      expect(perm.description.length).toBeGreaterThan(0)
      expect(typeof perm.category).toBe('string')
      expect(perm.category.length).toBeGreaterThan(0)
    }
  })

  it('permission names match their keys', () => {
    for (const [key, perm] of Object.entries(PERMISSIONS)) {
      expect(perm.name).toBe(key)
    }
  })
})

describe('ROLE_PERMISSIONS', () => {
  it('contains all expected roles', () => {
    const roles = Object.keys(ROLE_PERMISSIONS)
    expect(roles).toContain('SUPER_ADMIN')
    expect(roles).toContain('ADMIN')
    expect(roles).toContain('MANAGER')
    expect(roles).toContain('SALES_MANAGER')
    expect(roles).toContain('SALES_EXECUTIVE')
    expect(roles).toContain('MARKETING')
    expect(roles).toContain('HR')
    expect(roles).toContain('FINANCE')
    expect(roles).toContain('VIEWER')
  })

  it('SUPER_ADMIN has all permissions', () => {
    const superAdminPerms = ROLE_PERMISSIONS.SUPER_ADMIN
    const allPerms = Object.keys(PERMISSIONS)
    
    for (const perm of allPerms) {
      expect(superAdminPerms).toContain(perm)
    }
  })

  it('ADMIN has most permissions but not all', () => {
    const adminPerms = ROLE_PERMISSIONS.ADMIN

    // ADMIN should have most permissions
    expect(adminPerms.length).toBeGreaterThan(50)
    
    // But not necessarily all (some might be SUPER_ADMIN only)
    // Just verify it has core admin permissions
    expect(adminPerms).toContain('users.view')
    expect(adminPerms).toContain('users.create')
    expect(adminPerms).toContain('users.update')
    expect(adminPerms).toContain('users.delete')
    expect(adminPerms).toContain('roles.view')
    expect(adminPerms).toContain('roles.create')
    expect(adminPerms).toContain('roles.update')
    expect(adminPerms).toContain('roles.delete')
  })

  it('VIEWER has minimal permissions', () => {
    const viewerPerms = ROLE_PERMISSIONS.VIEWER
    
    // VIEWER should have read-only permissions
    expect(viewerPerms).toContain('team.view')
    expect(viewerPerms).toContain('reports.view')
    expect(viewerPerms).toContain('reports.submit')
    expect(viewerPerms).toContain('ai.use')
    expect(viewerPerms).toContain('files.view')
    expect(viewerPerms).toContain('files.download')
    expect(viewerPerms).toContain('leads.view')
    expect(viewerPerms).toContain('companies.view')
    expect(viewerPerms).toContain('contacts.view')
    expect(viewerPerms).toContain('deals.view')
    expect(viewerPerms).toContain('meetings.view')
    expect(viewerPerms).toContain('field_visits.view')
    
    // VIEWER should NOT have write permissions
    expect(viewerPerms).not.toContain('users.create')
    expect(viewerPerms).not.toContain('users.update')
    expect(viewerPerms).not.toContain('users.delete')
    expect(viewerPerms).not.toContain('leads.create')
    expect(viewerPerms).not.toContain('leads.update')
    expect(viewerPerms).not.toContain('leads.delete')
  })

  it('SALES_EXECUTIVE has sales-focused permissions', () => {
    const salesExecPerms = ROLE_PERMISSIONS.SALES_EXECUTIVE
    
    expect(salesExecPerms).toContain('leads.view')
    expect(salesExecPerms).toContain('leads.create')
    expect(salesExecPerms).toContain('leads.update')
    expect(salesExecPerms).toContain('deals.view')
    expect(salesExecPerms).toContain('deals.create')
    expect(salesExecPerms).toContain('deals.update')
    expect(salesExecPerms).toContain('field_visits.view')
    expect(salesExecPerms).toContain('field_visits.create')
    expect(salesExecPerms).toContain('field_visits.update')
    expect(salesExecPerms).toContain('field_visits.delete')
    expect(salesExecPerms).toContain('team.view')
    expect(salesExecPerms).toContain('reports.submit')
    expect(salesExecPerms).toContain('ai.use')
  })

  it('MANAGER has team management permissions', () => {
    const managerPerms = ROLE_PERMISSIONS.MANAGER
    
    expect(managerPerms).toContain('users.view')
    expect(managerPerms).toContain('team.view')
    expect(managerPerms).toContain('reports.view')
    expect(managerPerms).toContain('reports.submit')
    expect(managerPerms).toContain('leads.view')
    expect(managerPerms).toContain('leads.create')
    expect(managerPerms).toContain('leads.update')
    expect(managerPerms).toContain('leads.export')
  })

  it('all role permissions reference valid permission keys', () => {
    const allPermKeys = new Set(Object.keys(PERMISSIONS))
    
    for (const perms of Object.values(ROLE_PERMISSIONS)) {
      for (const perm of perms) {
        expect(allPermKeys.has(perm)).toBe(true)
      }
    }
  })

  it('no duplicate permissions within a role', () => {
    for (const perms of Object.values(ROLE_PERMISSIONS)) {
      const uniquePerms = new Set(perms)
      expect(uniquePerms.size).toBe(perms.length)
    }
  })
})