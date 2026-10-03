import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock dependencies
vi.mock('@/lib/db', () => ({
  prisma: {
    dailyReport: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    session: {
      findMany: vi.fn(),
    },
    activity: {
      findMany: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
    },
    aIReport: {
      findFirst: vi.fn(),
    },
    department: {
      findMany: vi.fn(),
    },
    team: {
      findMany: vi.fn(),
    },
    followUp: {
      count: vi.fn(),
    },
    file: {
      count: vi.fn(),
    },
  },
}))

vi.mock('@/lib/session', () => ({
  requireApiSession: vi.fn(),
}))

vi.mock('@/services/ai.service', () => ({
  generateEmployeeSummary: vi.fn(),
}))

import { prisma } from '@/lib/db'
import { requireApiSession } from '@/lib/session'
import { generateEmployeeSummary } from '@/services/ai.service'
import {
  getTodayReportDraft,
  submitDailyReport,
} from '@/services/daily-report.service'

const mockPrisma = vi.mocked(prisma)
const mockRequireApiSession = vi.mocked(requireApiSession)
const mockGenerateEmployeeSummary = vi.mocked(generateEmployeeSummary)

describe('daily-report.service', () => {
  const mockSession = {
    user: {
      id: 'user-1',
      email: 'test@example.com',
      name: 'Test User',
      organizationId: 'org-1',
      roles: ['SALES_EXECUTIVE'],
      department: { id: 'dept-1' },
      team: { id: 'team-1' },
      permissions: ['reports.submit', 'team.view', 'team.view_all'],
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireApiSession.mockResolvedValue(mockSession)
    mockGenerateEmployeeSummary.mockResolvedValue({ id: 'ai-report-1' })
    // Default mocks for getTodayReportDraft
    mockPrisma.dailyReport.findFirst.mockResolvedValue(null)
    mockPrisma.followUp.count.mockResolvedValue(0)
    mockPrisma.activity.count.mockResolvedValue(0)
    mockPrisma.activity.findMany.mockResolvedValue([])
    mockPrisma.file.count.mockResolvedValue(0)
    mockPrisma.session.findMany.mockResolvedValue([])
  })

  describe('getTodayReportDraft', () => {
    it('returns existing draft for today', async () => {
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      mockPrisma.dailyReport.findFirst.mockResolvedValue({
        id: 'report-1',
        userId: 'user-1',
        organizationId: 'org-1',
        date: today,
        workDescription: 'Draft work',
        completedWork: 'Draft completed',
        pendingWork: 'Draft pending',
        blockers: 'Draft blockers',
        tomorrowPlan: 'Draft plan',
        tasksCompletedCount: 3,
        crmRecordsUpdatedCount: 2,
        leadsWorkedOnCount: 1,
        filesUploadedCount: 0,
        activeWorkingTimeMinutes: 120,
        status: 'DRAFT',
        createdAt: new Date(),
        updatedAt: new Date(),
        user: { id: 'user-1', name: 'Test User', email: 'test@example.com' },
        aiReport: null,
      })

      const draftResult = await getTodayReportDraft()

      expect(draftResult.success).toBe(true)
      const draft = draftResult.data
      expect(draft).not.toBeNull()
      expect(draft.existingReport).not.toBeNull()
      expect(draft.existingReport?.workDescription).toBe('Draft work')
      expect(draft.existingReport?.status).toBe('DRAFT')
    })

    it('returns computed draft when no existing report', async () => {
      mockPrisma.dailyReport.findFirst.mockResolvedValue(null)
      mockPrisma.followUp.count.mockResolvedValue(3)
      mockPrisma.activity.count.mockResolvedValue(5)
      mockPrisma.activity.findMany.mockResolvedValue([{ leadId: 'lead-1' }, { leadId: 'lead-2' }])
      mockPrisma.file.count.mockResolvedValue(2)
      mockPrisma.session.findMany.mockResolvedValue([])

      const draftResult = await getTodayReportDraft()

      expect(draftResult.success).toBe(true)
      const draft = draftResult.data
      expect(draft).not.toBeNull()
      expect(draft.existingReport).toBeNull()
      expect(draft.tasksCompletedCount).toBe(3)
      expect(draft.crmRecordsUpdatedCount).toBe(5)
      expect(draft.leadsWorkedOnCount).toBe(2)
      expect(draft.filesUploadedCount).toBe(2)
    })
  })

  describe('submitDailyReport', () => {
    it('updates existing draft and submits', async () => {
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      const mockDraft = {
        id: 'report-1',
        userId: 'user-1',
        organizationId: 'org-1',
        date: today,
        workDescription: 'Work done',
        completedWork: 'Completed tasks',
        pendingWork: 'Pending tasks',
        blockers: 'None',
        tomorrowPlan: 'More work',
        tasksCompletedCount: 5,
        crmRecordsUpdatedCount: 3,
        leadsWorkedOnCount: 2,
        filesUploadedCount: 1,
        activeWorkingTimeMinutes: 240,
        status: 'DRAFT',
        createdAt: new Date(),
        updatedAt: new Date(),
        user: { id: 'user-1', name: 'Test User', email: 'test@example.com' },
        aiReport: null,
      }

      mockPrisma.dailyReport.findFirst.mockResolvedValue(mockDraft)

      mockPrisma.dailyReport.update.mockResolvedValue({
        ...mockDraft,
        status: 'SUBMITTED',
      })

      const result = await submitDailyReport({ date: today })

      expect(result.success).toBe(true)
      expect(result.data.status).toBe('SUBMITTED')
      expect(mockPrisma.dailyReport.update).toHaveBeenCalled()
    })

    it('creates new report when no existing report', async () => {
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      // Mock getTodayReportDraft to return computed draft (no existing report)
      mockPrisma.dailyReport.findFirst.mockResolvedValue(null)
      mockPrisma.followUp.count.mockResolvedValue(3)
      mockPrisma.activity.count.mockResolvedValue(5)
      mockPrisma.activity.findMany.mockResolvedValue([{ leadId: 'lead-1' }, { leadId: 'lead-2' }])
      mockPrisma.file.count.mockResolvedValue(2)
      mockPrisma.session.findMany.mockResolvedValue([
        { createdAt: new Date(today.getTime() + 3600000), lastSeenAt: new Date(today.getTime() + 7200000), updatedAt: new Date() }
      ])

      // Mock create for new report
      mockPrisma.dailyReport.create.mockResolvedValue({
        id: 'report-new',
        userId: 'user-1',
        organizationId: 'org-1',
        date: today,
        workDescription: 'Work done',
        completedWork: 'Completed tasks',
        pendingWork: 'Pending tasks',
        blockers: 'None',
        tomorrowPlan: 'More work',
        tasksCompletedCount: 3,
        crmRecordsUpdatedCount: 5,
        leadsWorkedOnCount: 2,
        filesUploadedCount: 2,
        activeWorkingTimeMinutes: 240,
        status: 'SUBMITTED',
        createdAt: new Date(),
        updatedAt: new Date(),
        user: { id: 'user-1', name: 'Test User', email: 'test@example.com' },
        aiReport: null,
      })

      const result = await submitDailyReport({ 
        date: today,
        workDescription: 'Work done',
        completedWork: 'Completed tasks',
        pendingWork: 'Pending tasks',
        blockers: 'None',
        tomorrowPlan: 'More work',
      })

      expect(result.success).toBe(true)
      expect(result.data.status).toBe('SUBMITTED')
      expect(result.data.id).toBe('report-new')
      expect(mockPrisma.dailyReport.create).toHaveBeenCalled()
    })
  })
})