import { describe, it, expect } from 'vitest'
import { getRecordScope, canManageAssignments } from '@/lib/record-scope'

// Mock Session user type
type MockUser = {
  roles: string[]
  department?: { id: string } | null
}

function createMockUser(overrides: Partial<MockUser> = {}): MockUser {
  return {
    roles: [],
    department: null,
    ...overrides,
  }
}

describe('getRecordScope', () => {
  it('returns ALL for SUPER_ADMIN', () => {
    const user = createMockUser({ roles: ['SUPER_ADMIN'] })
    expect(getRecordScope(user as any)).toBe('ALL')
  })

  it('returns ALL for ADMIN', () => {
    const user = createMockUser({ roles: ['ADMIN'] })
    expect(getRecordScope(user as any)).toBe('ALL')
  })

  it('returns ALL when user has both SUPER_ADMIN and other roles', () => {
    const user = createMockUser({ roles: ['SUPER_ADMIN', 'SALES_EXECUTIVE'] })
    expect(getRecordScope(user as any)).toBe('ALL')
  })

  it('returns DEPARTMENT for MANAGER', () => {
    const user = createMockUser({ roles: ['MANAGER'] })
    expect(getRecordScope(user as any)).toBe('DEPARTMENT')
  })

  it('returns DEPARTMENT for SALES_MANAGER', () => {
    const user = createMockUser({ roles: ['SALES_MANAGER'] })
    expect(getRecordScope(user as any)).toBe('DEPARTMENT')
  })

  it('returns DEPARTMENT when user has MANAGER and other roles', () => {
    const user = createMockUser({ roles: ['MANAGER', 'SALES_EXECUTIVE'] })
    expect(getRecordScope(user as any)).toBe('DEPARTMENT')
  })

  it('returns OWN for SALES_EXECUTIVE', () => {
    const user = createMockUser({ roles: ['SALES_EXECUTIVE'] })
    expect(getRecordScope(user as any)).toBe('OWN')
  })

  it('returns OWN for MARKETING', () => {
    const user = createMockUser({ roles: ['MARKETING'] })
    expect(getRecordScope(user as any)).toBe('OWN')
  })

  it('returns OWN for HR', () => {
    const user = createMockUser({ roles: ['HR'] })
    expect(getRecordScope(user as any)).toBe('OWN')
  })

  it('returns OWN for FINANCE', () => {
    const user = createMockUser({ roles: ['FINANCE'] })
    expect(getRecordScope(user as any)).toBe('OWN')
  })

  it('returns OWN for VIEWER', () => {
    const user = createMockUser({ roles: ['VIEWER'] })
    expect(getRecordScope(user as any)).toBe('OWN')
  })

  it('returns OWN for unknown role', () => {
    const user = createMockUser({ roles: ['UNKNOWN_ROLE'] })
    expect(getRecordScope(user as any)).toBe('OWN')
  })

  it('returns OWN for empty roles array', () => {
    const user = createMockUser({ roles: [] })
    expect(getRecordScope(user as any)).toBe('OWN')
  })

  it('returns OWN for undefined roles', () => {
    const user = createMockUser({ roles: undefined as any })
    expect(getRecordScope(user as any)).toBe('OWN')
  })

  it('priority: SUPER_ADMIN > MANAGER > SALES_EXECUTIVE', () => {
    // SUPER_ADMIN takes precedence over MANAGER
    const superAdminManager = createMockUser({ roles: ['SUPER_ADMIN', 'MANAGER'] })
    expect(getRecordScope(superAdminManager as any)).toBe('ALL')
    
    // MANAGER takes precedence over SALES_EXECUTIVE
    const managerSales = createMockUser({ roles: ['MANAGER', 'SALES_EXECUTIVE'] })
    expect(getRecordScope(managerSales as any)).toBe('DEPARTMENT')
  })

  it('returns correct type', () => {
    const user = createMockUser({ roles: ['ADMIN'] })
    const scope = getRecordScope(user as any)
    expect(['ALL', 'DEPARTMENT', 'OWN']).toContain(scope)
  })
})

describe('canManageAssignments', () => {
  it('returns true for SUPER_ADMIN', () => {
    expect(canManageAssignments({ roles: ['SUPER_ADMIN'] })).toBe(true)
  })

  it('returns true for ADMIN', () => {
    expect(canManageAssignments({ roles: ['ADMIN'] })).toBe(true)
  })

  it('returns true when SUPER_ADMIN is among multiple roles', () => {
    expect(canManageAssignments({ roles: ['MANAGER', 'SUPER_ADMIN'] })).toBe(true)
  })

  it('returns true when ADMIN is among multiple roles', () => {
    expect(canManageAssignments({ roles: ['SALES_EXECUTIVE', 'ADMIN'] })).toBe(true)
  })

  it('returns false for MANAGER', () => {
    expect(canManageAssignments({ roles: ['MANAGER'] })).toBe(false)
  })

  it('returns false for SALES_EXECUTIVE', () => {
    expect(canManageAssignments({ roles: ['SALES_EXECUTIVE'] })).toBe(false)
  })

  it('returns false for VIEWER', () => {
    expect(canManageAssignments({ roles: ['VIEWER'] })).toBe(false)
  })

  it('returns false for empty roles', () => {
    expect(canManageAssignments({ roles: [] })).toBe(false)
  })

  it('returns false for undefined roles', () => {
    expect(canManageAssignments({})).toBe(false)
  })
})