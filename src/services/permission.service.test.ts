import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Prisma
vi.mock('@/lib/db', () => ({
  prisma: {
    userRole: {
      findMany: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/db'
import { getUserPermissions, hasPermission, hasAnyPermission, requirePermission } from '@/services/permission.service'

const mockUserRoleFindMany = vi.mocked(prisma.userRole.findMany)

describe('permission.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getUserPermissions', () => {
    it('returns permissions from user roles', async () => {
      mockUserRoleFindMany.mockResolvedValue([
        {
          role: {
            permissions: [
              { permission: { name: 'users.view' } },
              { permission: { name: 'users.create' } },
            ],
          },
        },
        {
          role: {
            permissions: [
              { permission: { name: 'leads.view' } },
            ],
          },
        },
      ])

      const permissions = await getUserPermissions('user-1', 'org-1')

      expect(permissions).toEqual(expect.arrayContaining(['users.view', 'users.create', 'leads.view']))
      expect(mockUserRoleFindMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          user: { organizationId: 'org-1' },
        },
        include: {
          role: {
            include: {
              permissions: {
                include: { permission: true },
              },
            },
          },
        },
      })
    })

    it('returns empty array when user has no roles', async () => {
      mockUserRoleFindMany.mockResolvedValue([])

      const permissions = await getUserPermissions('user-1', 'org-1')

      expect(permissions).toEqual([])
    })

    it('deduplicates permissions from multiple roles', async () => {
      mockUserRoleFindMany.mockResolvedValue([
        {
          role: {
            permissions: [
              { permission: { name: 'users.view' } },
            ],
          },
        },
        {
          role: {
            permissions: [
              { permission: { name: 'users.view' } }, // duplicate
              { permission: { name: 'users.update' } },
            ],
          },
        },
      ])

      const permissions = await getUserPermissions('user-1', 'org-1')

      expect(permissions).toEqual(expect.arrayContaining(['users.view', 'users.update']))
      expect(new Set(permissions).size).toBe(permissions.length) // no duplicates
    })

    it('filters by organizationId', async () => {
      mockUserRoleFindMany.mockResolvedValue([])

      await getUserPermissions('user-1', 'org-1')

      expect(mockUserRoleFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            user: { organizationId: 'org-1' },
          }),
        })
      )
    })
  })

  describe('hasPermission', () => {
    it('returns true when user has the permission', async () => {
      mockUserRoleFindMany.mockResolvedValue([
        {
          role: {
            permissions: [{ permission: { name: 'users.view' } }],
          },
        },
      ])

      const result = await hasPermission('user-1', 'org-1', 'users.view')

      expect(result).toBe(true)
    })

    it('returns false when user lacks the permission', async () => {
      mockUserRoleFindMany.mockResolvedValue([
        {
          role: {
            permissions: [{ permission: { name: 'users.view' } }],
          },
        },
      ])

      const result = await hasPermission('user-1', 'org-1', 'users.delete')

      expect(result).toBe(false)
    })
  })

  describe('hasAnyPermission', () => {
    it('returns true when user has at least one permission', async () => {
      mockUserRoleFindMany.mockResolvedValue([
        {
          role: {
            permissions: [{ permission: { name: 'users.view' } }],
          },
        },
      ])

      const result = await hasAnyPermission('user-1', 'org-1', ['users.view', 'users.delete'])

      expect(result).toBe(true)
    })

    it('returns false when user has none of the permissions', async () => {
      mockUserRoleFindMany.mockResolvedValue([
        {
          role: {
            permissions: [{ permission: { name: 'users.view' } }],
          },
        },
      ])

      const result = await hasAnyPermission('user-1', 'org-1', ['users.delete', 'users.create'])

      expect(result).toBe(false)
    })

    it('returns false for empty permission list', async () => {
      mockUserRoleFindMany.mockResolvedValue([])

      const result = await hasAnyPermission('user-1', 'org-1', [])

      expect(result).toBe(false)
    })
  })

  describe('requirePermission', () => {
    it('resolves when user has permission', async () => {
      mockUserRoleFindMany.mockResolvedValue([
        {
          role: {
            permissions: [{ permission: { name: 'users.view' } }],
          },
        },
      ])

      await expect(requirePermission('user-1', 'org-1', 'users.view')).resolves.toBeUndefined()
    })

    it('throws when user lacks permission', async () => {
      mockUserRoleFindMany.mockResolvedValue([
        {
          role: {
            permissions: [{ permission: { name: 'users.view' } }],
          },
        },
      ])

      await expect(requirePermission('user-1', 'org-1', 'users.delete')).rejects.toThrow(
        'Permission denied: users.delete'
      )
    })
  })
})