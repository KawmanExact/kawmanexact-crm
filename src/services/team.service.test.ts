import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findMany: vi.fn() },
    session: { findMany: vi.fn() },
    dailyReport: { findMany: vi.fn() },
    activity: { findMany: vi.fn() },
  },
}))

vi.mock('@/lib/session', () => ({
  requireApiSession: vi.fn(),
}))

import { prisma } from '@/lib/db'
import { requireApiSession } from '@/lib/session'
import {
  getTeamDashboardMetrics,
  getTeamMembers,
} from '@/services/team.service'

const mockPrisma = vi.mocked(prisma)
const mockRequireApiSession = vi.mocked(requireApiSession)

describe('team.service', () => {
  const mockSession = {
    user: {
      id: 'user-1',
      email: 'test@example.com',
      name: 'Manager',
      organizationId: 'org-1',
      roles: ['MANAGER'],
      department: { id: 'dept-1' },
      permissions: ['team.view', 'team.view_all'],
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireApiSession.mockResolvedValue(mockSession)
  })

  describe('getTeamDashboardMetrics', () => {
    it('returns metrics for team with view_all permission', async () => {
      const today = new Date()
      mockPrisma.user.findMany.mockResolvedValue([
        { id: 'user-1', name: 'User 1', email: 'user1@test.com', lastLoginAt: new Date() },
        { id: 'user-2', name: 'User 2', email: 'user2@test.com', lastLoginAt: new Date() },
      ])
      mockPrisma.session.findMany.mockResolvedValue([{ userId: 'user-1' }])
      mockPrisma.dailyReport.findMany.mockResolvedValue([
        { userId: 'user-1', status: 'SUBMITTED', date: today },
      ])
      mockPrisma.activity.findMany.mockResolvedValue([])

      const metrics = await getTeamDashboardMetrics()

      expect(metrics.success).toBe(true)
      expect(metrics.data!.totalEmployees).toBe(2)
      expect(metrics.data!.onlineEmployees).toBe(1)
      expect(metrics.data!.offlineEmployees).toBe(1)
      expect(metrics.data!.submittedToday).toBe(1)
      expect(metrics.data!.pendingToday).toBe(1)
    })

    it('returns error when user lacks team.view_all permission', async () => {
      mockRequireApiSession.mockResolvedValue({
        ...mockSession,
        user: { ...mockSession.user, permissions: ['team.view'] },
      })

      const result = await getTeamDashboardMetrics()

      expect(result).toEqual({
        success: false,
        error: 'Forbidden: missing team.view_all',
      })
    })
  })

  describe('getTeamMembers', () => {
    it('returns team members with online status and activity', async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        {
          id: 'user-1',
          name: 'User 1',
          email: 'user1@test.com',
          designation: 'Sales',
          team: { name: 'Team A' },
          department: { name: 'Sales Dept' },
          status: 'ACTIVE',
          lastLoginAt: new Date(),
        },
      ])
      mockPrisma.session.findMany
        .mockResolvedValueOnce([{ userId: 'user-1', lastSeenAt: new Date() }]) // online check
        .mockResolvedValueOnce([{ userId: 'user-1', createdAt: new Date(), lastSeenAt: new Date(), updatedAt: new Date() }]) // live sessions
      mockPrisma.dailyReport.findMany.mockResolvedValue([])
      mockPrisma.session.findMany.mockResolvedValue([])

      const result = await getTeamMembers()

      expect(result.success).toBe(true)
      expect(result.data).toHaveLength(1)
      expect(result.data![0].name).toBe('User 1')
      expect(result.data![0].isOnline).toBe(true)
    })
  })
})
