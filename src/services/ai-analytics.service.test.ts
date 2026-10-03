import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  prisma: {
    aIUsage: {
      findMany: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn(),
      groupBy: vi.fn(),
    },
    user: { findMany: vi.fn() },
  },
}))

vi.mock('@/lib/session', () => ({
  requireApiSession: vi.fn(),
}))

import { prisma } from '@/lib/db'
import { requireApiSession } from '@/lib/session'
import {
  getAIUsage,
  getAIUsageAggregate,
  getAIUsageSummary,
  canViewAIAnalytics,
  AI_ANALYTICS_PERMISSIONS,
} from '@/services/ai-analytics.service'

const mockPrisma = vi.mocked(prisma)
const mockRequireApiSession = vi.mocked(requireApiSession)

function session(permissions: string[], organizationId = 'org-1') {
  return { user: { id: 'user-1', organizationId, permissions } } as never
}

/** VIEWER's full real-world grant set — the role that could previously see
 *  everyone's AI usage and cost. */
const VIEWER_PERMISSIONS = [
  'team.view',
  'reports.view',
  'reports.submit',
  'ai.use',
  'files.view',
  'files.download',
  'leads.view',
  'companies.view',
  'contacts.view',
  'deals.view',
  'meetings.view',
  'field_visits.view',
]

const ADMIN_PERMISSIONS = ['ai.use', 'ai.analytics.view', 'settings.manage', 'audit_logs.view']
describe('canViewAIAnalytics', () => {
  it.each([...AI_ANALYTICS_PERMISSIONS])('grants access via %s', (p) => {
    expect(canViewAIAnalytics([p])).toBe(true)
  })

  it('does NOT grant access via ai.use, which every role holds', () => {
    expect(canViewAIAnalytics(['ai.use'])).toBe(false)
  })

  it('denies a VIEWER, who only holds ai.use', () => {
    expect(canViewAIAnalytics(VIEWER_PERMISSIONS)).toBe(false)
  })

  it('denies an empty, null, or undefined permission list', () => {
    expect(canViewAIAnalytics([])).toBe(false)
    expect(canViewAIAnalytics(null)).toBe(false)
    expect(canViewAIAnalytics(undefined)).toBe(false)
  })

  it('exposes the permission set it checks', () => {
    expect([...AI_ANALYTICS_PERMISSIONS]).toEqual([
      'ai.analytics.view',
      'settings.manage',
      'audit_logs.view',
    ])
  })
})

describe('ai-analytics.service authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.aIUsage.findMany.mockResolvedValue([] as never)
    mockPrisma.aIUsage.count.mockResolvedValue(0 as never)
    mockPrisma.aIUsage.aggregate.mockResolvedValue({
      _count: { _all: 0 },
      _sum: { estimatedCost: null },
    } as never)
    mockPrisma.aIUsage.groupBy.mockResolvedValue([] as never)
    mockPrisma.user.findMany.mockResolvedValue([] as never)
  })

  describe('getAIUsage', () => {
    it('refuses a VIEWER', async () => {
      mockRequireApiSession.mockResolvedValue(session(VIEWER_PERMISSIONS))
      const result = await getAIUsage()
      expect(result.success).toBe(false)
      expect(mockPrisma.aIUsage.findMany).not.toHaveBeenCalled()
    })

    it('allows an admin', async () => {
      mockRequireApiSession.mockResolvedValue(session(ADMIN_PERMISSIONS))
      const result = await getAIUsage()
      expect(result.success).toBe(true)
      expect(mockPrisma.aIUsage.findMany).toHaveBeenCalled()
    })

    it('scopes to the session org', async () => {
      mockRequireApiSession.mockResolvedValue(session(ADMIN_PERMISSIONS, 'org-real'))
      await getAIUsage({ userId: 'user-9' })
      expect(mockPrisma.aIUsage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org-real' }) })
      )
      expect(mockPrisma.aIUsage.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org-real' }) })
      )
    })

    it('has no organizationId filter to override the session org', async () => {
      // Compile-time guarantee: AIUsageFilters omits organizationId, so a
      // caller cannot widen the query even by accident. @ts-expect-error fails
      // the build if that field is ever re-added.
      const filters = { organizationId: 'org-attacker' }
      // @ts-expect-error organizationId is intentionally not part of AIUsageFilters
      const typed: Parameters<typeof getAIUsage>[0] = filters
      void typed

      mockRequireApiSession.mockResolvedValue(session(ADMIN_PERMISSIONS, 'org-real'))
      await getAIUsage(filters)
      expect(mockPrisma.aIUsage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org-real' }) })
      )
    })
  })

  describe('getAIUsageAggregate', () => {
    it('refuses a VIEWER', async () => {
      mockRequireApiSession.mockResolvedValue(session(VIEWER_PERMISSIONS))
      const result = await getAIUsageAggregate()
      expect(result.success).toBe(false)
      expect(mockPrisma.aIUsage.findMany).not.toHaveBeenCalled()
    })

    it('scopes to the session org', async () => {
      mockRequireApiSession.mockResolvedValue(session(ADMIN_PERMISSIONS, 'org-real'))
      await getAIUsageAggregate({ feature: 'chat' })
      expect(mockPrisma.aIUsage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org-real' }) })
      )
    })
  })

  describe('getAIUsageSummary', () => {
    it('refuses a VIEWER', async () => {
      mockRequireApiSession.mockResolvedValue(session(VIEWER_PERMISSIONS))
      const result = await getAIUsageSummary()
      expect(result.success).toBe(false)
      expect(mockPrisma.aIUsage.aggregate).not.toHaveBeenCalled()
      expect(mockPrisma.aIUsage.groupBy).not.toHaveBeenCalled()
    })

    it('allows an admin and scopes to the session org', async () => {
      mockRequireApiSession.mockResolvedValue(session(ADMIN_PERMISSIONS, 'org-real'))
      const result = await getAIUsageSummary()
      expect(result.success).toBe(true)
      expect(mockPrisma.aIUsage.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org-real' }) })
      )
    })
  })
})
