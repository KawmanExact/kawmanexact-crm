import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock dependencies
vi.mock('@/lib/db', () => ({
  prisma: {
    lead: { groupBy: vi.fn(), findMany: vi.fn() },
    deal: { groupBy: vi.fn(), aggregate: vi.fn(), findMany: vi.fn() },
    followUp: { count: vi.fn() },
    fieldVisit: { findMany: vi.fn(), count: vi.fn(), groupBy: vi.fn() },
    dailyReport: { findMany: vi.fn(), findFirst: vi.fn() },
    session: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
    activity: { findMany: vi.fn() },
    aIReport: { create: vi.fn(), findFirst: vi.fn(), delete: vi.fn() },
    visitReport: { findMany: vi.fn() },
    checkIn: { findMany: vi.fn() },
    meeting: { findMany: vi.fn() },
  },
}))

vi.mock('@/lib/session', () => ({
  requireApiSession: vi.fn(),
}))

vi.mock('@/lib/ai', () => ({
  streamChatCompletion: vi.fn(),
  generateCompletion: vi.fn(),
  isAIConfigured: vi.fn(),
}))

vi.mock('@/lib/record-scope', () => ({
  getRecordScope: vi.fn(),
}))

import { prisma } from '@/lib/db'
import { requireApiSession } from '@/lib/session'
import { generateCompletion, isAIConfigured } from '@/lib/ai'
import { getRecordScope } from '@/lib/record-scope'
import {
  generateEmployeeDailySummary,
  generateFieldSalesDailySummary,
  analyzeQuestion,
  deleteReport,
} from '@/services/ai.service'

const mockPrisma = vi.mocked(prisma)
const mockRequireApiSession = vi.mocked(requireApiSession)
const mockGenerateCompletion = vi.mocked(generateCompletion)
const mockIsAIConfigured = vi.mocked(isAIConfigured)
const mockGetRecordScope = vi.mocked(getRecordScope)

describe('ai.service', () => {
  const mockSession = {
    user: {
      id: 'user-1',
      email: 'test@example.com',
      name: 'Test User',
      organizationId: 'org-1',
      roles: ['SALES_EXECUTIVE'],
      department: { id: 'dept-1' },
      permissions: ['ai.use', 'team.view', 'team.view_all', 'reports.view', 'reports.view_all', 'reports.submit'],
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireApiSession.mockResolvedValue(mockSession)
    mockIsAIConfigured.mockReturnValue(true)
    mockGetRecordScope.mockReturnValue('OWN')
    mockGenerateCompletion.mockResolvedValue('Mocked response')
    // Default mocks for buildOrgContext
    mockPrisma.lead.groupBy.mockResolvedValue([])
    mockPrisma.deal.groupBy.mockResolvedValue([])
    mockPrisma.deal.aggregate.mockResolvedValue({ _sum: { value: 0 }, _count: { _all: 0 } })
    mockPrisma.followUp.count.mockResolvedValue(0)
    mockPrisma.deal.findMany.mockResolvedValue([])
    mockPrisma.lead.findMany.mockResolvedValue([])
    mockPrisma.fieldVisit.count.mockResolvedValue(0)
    mockPrisma.fieldVisit.findMany.mockResolvedValue([])
    mockPrisma.fieldVisit.groupBy.mockResolvedValue([])
    mockPrisma.checkIn.findMany.mockResolvedValue([])
    mockPrisma.visitReport.findMany.mockResolvedValue([])
    mockPrisma.meeting.findMany.mockResolvedValue([])
    mockPrisma.user.findMany.mockResolvedValue([])
    mockPrisma.dailyReport.findMany.mockResolvedValue([])
    mockPrisma.activity.findMany.mockResolvedValue([])
    mockPrisma.session.findMany.mockResolvedValue([])
  })

  describe('generateEmployeeDailySummary', () => {
    it('generates summary and saves AI report', async () => {
      mockPrisma.dailyReport.findFirst.mockResolvedValue({
        id: 'report-1',
        date: new Date('2026-01-15'),
        workDescription: 'Worked on leads',
        completedWork: 'Completed 5 calls',
        pendingWork: 'Follow up tomorrow',
        blockers: null,
        tomorrowPlan: 'More calls',
        tasksCompletedCount: 5,
        crmRecordsUpdatedCount: 3,
        leadsWorkedOnCount: 2,
        filesUploadedCount: 1,
        activeWorkingTimeMinutes: 240,
        status: 'SUBMITTED',
        user: { name: 'Test User', email: 'test@example.com' },
        aiReport: null,
      })
      mockPrisma.aIReport.create.mockResolvedValue({ id: 'ai-report-1' })
      mockGenerateCompletion.mockResolvedValue('AI generated summary')

      const result = await generateEmployeeDailySummary('report-1')

      expect(result).toEqual({ success: true, data: { id: 'ai-report-1' } })
      expect(mockPrisma.aIReport.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'employee_daily_summary',
            organizationId: 'org-1',
            generatedById: 'user-1',
          }),
        })
      )
    })

    it('returns error when no reports found for date', async () => {
      mockPrisma.dailyReport.findFirst.mockResolvedValue(null)

      const result = await generateEmployeeDailySummary('report-1')

      expect(result).toEqual({ success: false, error: 'Daily report not found' })
    })
  })

  describe('generateFieldDailySummary', () => {
    it('generates field sales summary and saves AI report', async () => {
      const now = new Date()
      mockPrisma.fieldVisit.findMany.mockResolvedValue([
        {
          id: 'visit-1',
          title: 'Client Meeting',
          status: 'COMPLETED',
          scheduledAt: now,
          checkInAt: now,
          checkOutAt: now,
          location: 'Client Office',
          notes: 'Good meeting',
          purpose: 'Discuss proposal',
          address: '123 Client St',
          assignee: { id: 'user-1', name: 'Test User', email: 'test@example.com' },
          company: { name: 'Company 1' },
          contact: { name: 'Contact 1' },
          deal: { name: 'Deal 1', value: 100000 },
          lead: { name: 'Lead 1', company: 'Company 1' },
          visitReports: [],
        },
      ])
      mockPrisma.visitReport.findMany.mockResolvedValue([])
      mockPrisma.dailyReport.findFirst.mockResolvedValue(null)
      mockPrisma.checkIn.findMany.mockResolvedValue([])
      mockPrisma.fieldVisit.count.mockResolvedValue(0)
      mockPrisma.deal.findMany.mockResolvedValue([])
      mockPrisma.aIReport.create.mockResolvedValue({ id: 'ai-report-2' })
      mockGenerateCompletion.mockResolvedValue('Field sales summary')

      const result = await generateFieldSalesDailySummary()

      expect(result).toEqual({ success: true, data: { id: 'ai-report-2' } })
      expect(mockPrisma.aIReport.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'field_sales_daily_summary',
            organizationId: 'org-1',
            generatedById: 'user-1',
          }),
        })
      )
    })
  })

  describe('analyzeQuestion', () => {
    it('analyzes question with org context', async () => {
      mockPrisma.lead.groupBy.mockResolvedValue([])
      mockPrisma.deal.groupBy.mockResolvedValue([])
      mockPrisma.deal.aggregate.mockResolvedValue({ _sum: { value: 0 }, _count: { _all: 0 } })
      mockPrisma.followUp.count.mockResolvedValue(0)
      mockPrisma.deal.findMany.mockResolvedValue([])
      mockPrisma.lead.findMany.mockResolvedValue([])
      mockPrisma.fieldVisit.findMany.mockResolvedValue([])
      mockPrisma.dailyReport.findMany.mockResolvedValue([])
      mockPrisma.session.findMany.mockResolvedValue([])
      mockGenerateCompletion.mockResolvedValue('Analysis result')

      const result = await analyzeQuestion('How many leads?')

      expect(result).toBe('Analysis result')
      expect(mockGenerateCompletion).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ role: 'user', content: 'How many leads?' }),
        ]),
        expect.stringContaining('data analyst'),
        expect.any(Object)
      )
    })

    it('includes document context when provided', async () => {
      mockPrisma.lead.groupBy.mockResolvedValue([])
      mockPrisma.deal.groupBy.mockResolvedValue([])
      mockPrisma.deal.aggregate.mockResolvedValue({ _sum: { value: 0 }, _count: { _all: 0 } })
      mockPrisma.followUp.count.mockResolvedValue(0)
      mockPrisma.deal.findMany.mockResolvedValue([])
      mockPrisma.lead.findMany.mockResolvedValue([])
      mockPrisma.fieldVisit.findMany.mockResolvedValue([])
      mockPrisma.dailyReport.findMany.mockResolvedValue([])
      mockPrisma.session.findMany.mockResolvedValue([])
      mockGenerateCompletion.mockResolvedValue('Analysis with docs')

      const result = await analyzeQuestion('Analyze this', { docContext: 'Document content' })

      expect(result).toBe('Analysis with docs')
      expect(mockGenerateCompletion).toHaveBeenCalledWith(
        expect.any(Array),
        expect.any(String),
        expect.objectContaining({ docContext: 'Document content' })
      )
    })
  })

  describe('deleteReport', () => {
    it('deletes report when found', async () => {
      mockPrisma.aIReport.findFirst.mockResolvedValue({ id: 'report-1' })
      mockPrisma.aIReport.delete.mockResolvedValue({})

      const result = await deleteReport('report-1')

      expect(result.success).toBe(true)
      expect(mockPrisma.aIReport.delete).toHaveBeenCalledWith({ where: { id: 'report-1' } })
    })

    it('returns error when report not found', async () => {
      mockPrisma.aIReport.findFirst.mockResolvedValue(null)

      const result = await deleteReport('report-1')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Report not found')
    })

    it('returns error when not authenticated', async () => {
      mockRequireApiSession.mockRejectedValue(new Error('Not authenticated'))

      const result = await deleteReport('report-1')

      expect(result.success).toBe(false)
      expect(result.error).toContain('Not authenticated')
    })

    it('allows the report creator to delete their own report', async () => {
      mockPrisma.aIReport.findFirst.mockResolvedValue({
        id: 'report-1',
        type: 'weekly',
        generatedById: 'user-1',
      } as never)
      mockPrisma.aIReport.delete.mockResolvedValue({})

      const result = await deleteReport('report-1')

      expect(result.success).toBe(true)
      expect(mockPrisma.aIReport.delete).toHaveBeenCalledWith({ where: { id: 'report-1' } })
    })

    it('refuses deletion by a non-creator without reports.view_all', async () => {
      mockPrisma.aIReport.findFirst.mockResolvedValue({
        id: 'report-1',
        type: 'weekly',
        generatedById: 'someone-else',
      } as never)
      mockRequireApiSession.mockResolvedValue({
        user: { ...mockSession.user, permissions: ['ai.use', 'reports.view'] },
      } as never)
      mockGetRecordScope.mockReturnValue('OWN')

      const result = await deleteReport('report-1')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Report not found')
      expect(mockPrisma.aIReport.delete).not.toHaveBeenCalled()
    })

    it('allows deletion by a holder of reports.view_all', async () => {
      mockPrisma.aIReport.findFirst.mockResolvedValue({
        id: 'report-1',
        type: 'weekly',
        generatedById: 'someone-else',
      } as never)
      mockRequireApiSession.mockResolvedValue({
        user: { ...mockSession.user, permissions: ['reports.view_all'] },
      } as never)
      mockGetRecordScope.mockReturnValue('OWN')
      mockPrisma.aIReport.delete.mockResolvedValue({})

      const result = await deleteReport('report-1')

      expect(result.success).toBe(true)
      expect(mockPrisma.aIReport.delete).toHaveBeenCalled()
    })

    it('allows deletion by an ADMIN even without reports.view_all', async () => {
      mockPrisma.aIReport.findFirst.mockResolvedValue({
        id: 'report-1',
        type: 'weekly',
        generatedById: 'someone-else',
      } as never)
      mockRequireApiSession.mockResolvedValue({
        user: { ...mockSession.user, permissions: ['ai.use'] },
      } as never)
      mockGetRecordScope.mockReturnValue('ALL')
      mockPrisma.aIReport.delete.mockResolvedValue({})

      const result = await deleteReport('report-1')

      expect(result.success).toBe(true)
      expect(mockPrisma.aIReport.delete).toHaveBeenCalled()
    })
  })
})