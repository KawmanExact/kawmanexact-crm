import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  prisma: {
    activity: { findMany: vi.fn() },
    lead: { count: vi.fn() },
    deal: { count: vi.fn(), findMany: vi.fn(), groupBy: vi.fn(), findFirst: vi.fn() },
    meeting: { count: vi.fn(), findMany: vi.fn() },
    followUp: { count: vi.fn(), findMany: vi.fn() },
    fieldVisit: { count: vi.fn() },
    contact: { findMany: vi.fn(), findFirst: vi.fn() },
  },
}))

vi.mock('@/lib/session', () => ({
  requireApiSession: vi.fn(),
}))

vi.mock('samai-sdk', async () => {
  const actual = await vi.importActual('samai-sdk')
  return {
    ...actual,
    openai: vi.fn(() => ({ name: 'openai-mock' })),
    createClient: vi.fn(() => ({
      generate: vi.fn(),
      stream: vi.fn(),
      provider: { name: 'mock' },
    })),
    defineAgent: vi.fn((config) => ({ ...config, maxTurns: config.maxTurns ?? 10 })),
    runAgent: vi.fn(),
    generateSpeech: vi.fn(),
    transcribeAudio: vi.fn(),
  }
})

import { prisma } from '@/lib/db'
import { requireApiSession } from '@/lib/session'
import {
  isAdmin,
  resolveVoiceScope,
  buildVoiceScopeFilters,
  getTodaysActivitySummaryTool,
  getCrmSummaryTool,
  getDealStatusTool,
  getContactInfoTool,
  getUpcomingMeetingsTool,
  buildVoiceTools,
  buildVoiceAgent,
} from '@/services/voice-agent'

const mockPrisma = vi.mocked(prisma)
const mockRequireApiSession = vi.mocked(requireApiSession)

const EMPLOYEE_USER = {
  id: 'user-emp-1',
  email: 'emp@example.com',
  name: 'Sales Rep',
  organizationId: 'org-1',
  roles: ['SALES_EXECUTIVE'],
  department: { id: 'dept-1', name: 'Sales' },
  team: { id: 'team-1', name: 'East' },
  permissions: ['leads.view', 'deals.view', 'contacts.view', 'meetings.view', 'ai.use'],
}

const MANAGER_USER = {
  id: 'user-mgr-1',
  email: 'mgr@example.com',
  name: 'Sales Manager',
  organizationId: 'org-1',
  roles: ['MANAGER'],
  department: { id: 'dept-1', name: 'Sales' },
  team: { id: 'team-1', name: 'East' },
  permissions: ['leads.view', 'deals.view', 'team.view', 'ai.use'],
}

const ADMIN_USER = {
  id: 'user-admin-1',
  email: 'admin@example.com',
  name: 'Admin User',
  organizationId: 'org-1',
  roles: ['ADMIN'],
  department: { id: 'dept-1', name: 'Sales' },
  team: { id: 'team-1', name: 'East' },
  permissions: ['leads.view', 'deals.view', 'contacts.view', 'meetings.view', 'team.view_all', 'ai.use'],
}

const SUPER_ADMIN_USER = {
  id: 'user-sa-1',
  email: 'sa@example.com',
  name: 'Super Admin',
  organizationId: 'org-1',
  roles: ['SUPER_ADMIN'],
  department: null,
  team: null,
  permissions: ['leads.view', 'deals.view', 'contacts.view', 'meetings.view', 'team.view_all', 'ai.use'],
}

describe('voice-agent scope resolution', () => {
  describe('isAdmin', () => {
    it('returns true for ADMIN', () => {
      expect(isAdmin(ADMIN_USER as any)).toBe(true)
    })
    it('returns true for SUPER_ADMIN', () => {
      expect(isAdmin(SUPER_ADMIN_USER as any)).toBe(true)
    })
    it('returns false for SALES_EXECUTIVE', () => {
      expect(isAdmin(EMPLOYEE_USER as any)).toBe(false)
    })
    it('returns false for MANAGER', () => {
      expect(isAdmin(MANAGER_USER as any)).toBe(false)
    })
  })

  describe('resolveVoiceScope', () => {
    it('always returns org scope for full access', () => {
      expect(resolveVoiceScope()).toBe('org')
    })

    it('returns org for admin regardless of requested scope', () => {
      expect(resolveVoiceScope()).toBe('org')
    })
  })

  describe('buildVoiceScopeFilters', () => {
    it('returns org-wide filters (empty) for all users', () => {
      const filters = buildVoiceScopeFilters()
      expect(filters.ownerFilter).toEqual({})
      expect(filters.contactFilter).toEqual({})
      expect(filters.activityFilter).toEqual({})
      expect(filters.meetingFilter).toEqual({})
      expect(filters.visitFilter).toEqual({})
    })

    it('returns org-wide filters for manager regardless of scope', () => {
      const filters = buildVoiceScopeFilters()
      expect(filters.ownerFilter).toEqual({})
      expect(filters.activityFilter).toEqual({})
    })

    it('returns org-wide filters for admin requesting any scope', () => {
      const filtersOrg = buildVoiceScopeFilters()
      const filtersTeam = buildVoiceScopeFilters()
      const filtersMe = buildVoiceScopeFilters()
      expect(filtersOrg.ownerFilter).toEqual({})
      expect(filtersTeam.ownerFilter).toEqual({})
      expect(filtersMe.ownerFilter).toEqual({})
    })
  })
})

describe('getTodaysActivitySummary tool — scope enforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.activity.findMany.mockResolvedValue([])
    mockPrisma.lead.count.mockResolvedValue(5)
    mockPrisma.deal.count.mockResolvedValue(3)
    mockPrisma.meeting.count.mockResolvedValue(2)
    mockPrisma.followUp.count.mockResolvedValue(1)
    mockPrisma.fieldVisit.count.mockResolvedValue(1)
  })

  it('all users see org-wide activity data (no scope filtering)', async () => {
    mockRequireApiSession.mockResolvedValue({ user: EMPLOYEE_USER } as any)

    const tool = getTodaysActivitySummaryTool()
    await tool.execute({ scope: 'org' })

    const activityCall = mockPrisma.activity.findMany.mock.calls[0][0]
    expect(activityCall.where).not.toHaveProperty('actorId')
    expect(activityCall.where).not.toHaveProperty('actor')
    expect(activityCall.where.organizationId).toBe('org-1')

    const leadCall = mockPrisma.lead.count.mock.calls[0][0]
    expect(leadCall.where).not.toHaveProperty('ownerId')
    expect(leadCall.where).not.toHaveProperty('owner')
    expect(leadCall.where.organizationId).toBe('org-1')
  })

  it('admin sees org-wide activity data', async () => {
    mockRequireApiSession.mockResolvedValue({ user: ADMIN_USER } as any)

    const tool = getTodaysActivitySummaryTool()
    await tool.execute({ scope: 'org' })

    const activityCall = mockPrisma.activity.findMany.mock.calls[0][0]
    expect(activityCall.where).not.toHaveProperty('actorId')
    expect(activityCall.where).not.toHaveProperty('actor')
    expect(activityCall.where.organizationId).toBe('org-1')

    const leadCall = mockPrisma.lead.count.mock.calls[0][0]
    expect(leadCall.where).not.toHaveProperty('ownerId')
    expect(leadCall.where).not.toHaveProperty('owner')
    expect(leadCall.where.organizationId).toBe('org-1')
  })

  it('all users see org-wide activity data regardless of scope param', async () => {
    mockRequireApiSession.mockResolvedValue({ user: EMPLOYEE_USER } as any)

    const tool = getTodaysActivitySummaryTool()
    await tool.execute({ scope: 'org' })

    const activityCall = mockPrisma.activity.findMany.mock.calls[0][0]
    expect(activityCall.where).not.toHaveProperty('actorId')
    expect(activityCall.where).not.toHaveProperty('actor')
  })
})

describe('getCrmSummary tool — scope enforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.deal.groupBy.mockResolvedValue([])
    mockPrisma.lead.count.mockResolvedValue(10)
    mockPrisma.meeting.findMany.mockResolvedValue([])
    mockPrisma.followUp.findMany.mockResolvedValue([])
  })

  it('all users see org-wide crm data (no scope filtering)', async () => {
    mockRequireApiSession.mockResolvedValue({ user: EMPLOYEE_USER } as any)

    const tool = getCrmSummaryTool()
    await tool.execute({ scope: 'org' })

    const pipelineCall = mockPrisma.deal.groupBy.mock.calls[0][0]
    expect(pipelineCall.where.organizationId).toBe('org-1')
    expect(pipelineCall.where).not.toHaveProperty('ownerId')

    const leadsCall = mockPrisma.lead.count.mock.calls[0][0]
    expect(leadsCall.where).not.toHaveProperty('ownerId')
    expect(leadsCall.where.organizationId).toBe('org-1')
  })

  it('admin can see org-wide data when requesting org scope', async () => {
    mockRequireApiSession.mockResolvedValue({ user: ADMIN_USER } as any)

    const tool = getCrmSummaryTool()
    await tool.execute({ scope: 'org' })

    const pipelineCall = mockPrisma.deal.groupBy.mock.calls[0][0]
    expect(pipelineCall.where.ownerId).toBeUndefined()
    expect(pipelineCall.where.organizationId).toBe('org-1')

    const leadsCall = mockPrisma.lead.count.mock.calls[0][0]
    expect(leadsCall.where.ownerId).toBeUndefined()
    expect(leadsCall.where.organizationId).toBe('org-1')
  })
})

describe('getDealStatus tool — scope enforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.deal.findMany.mockResolvedValue([])
    mockPrisma.deal.findFirst.mockResolvedValue(null)
  })

  it('all users see org-wide deals regardless of role', async () => {
    mockRequireApiSession.mockResolvedValue({ user: EMPLOYEE_USER } as any)

    const tool = getDealStatusTool()
    await tool.execute({ dealNameOrId: 'Acme' })

    const call = mockPrisma.deal.findMany.mock.calls[0][0]
    expect(call.where.organizationId).toBe('org-1')
    expect(call.where).not.toHaveProperty('ownerId')
    expect(call.where).not.toHaveProperty('owner')
  })

  it('admin can search across all org deals', async () => {
    mockRequireApiSession.mockResolvedValue({ user: ADMIN_USER } as any)

    const tool = getDealStatusTool()
    await tool.execute({ dealNameOrId: 'Acme' })

    const call = mockPrisma.deal.findMany.mock.calls[0][0]
    expect(call.where.organizationId).toBe('org-1')
    expect(call.where).not.toHaveProperty('ownerId')
    expect(call.where).not.toHaveProperty('owner')
  })

  it('all users can look up deals by ID without scope filter', async () => {
    mockRequireApiSession.mockResolvedValue({ user: EMPLOYEE_USER } as any)

    const tool = getDealStatusTool()
    await tool.execute({ dealNameOrId: '0123456789abcdef012345678' })

    expect(mockPrisma.deal.findFirst).toHaveBeenCalled()
    const call = mockPrisma.deal.findFirst.mock.calls[0][0]
    expect(call.where.id).toBe('0123456789abcdef012345678')
    expect(call.where.organizationId).toBe('org-1')
    expect(call.where).not.toHaveProperty('ownerId')
  })

  it('all users can search all org contacts', async () => {
    mockRequireApiSession.mockResolvedValue({ user: EMPLOYEE_USER } as any)
    mockPrisma.contact.findMany.mockResolvedValue([])

    const tool = getContactInfoTool()
    await tool.execute({ nameOrEmail: 'john' })

    const call = mockPrisma.contact.findMany.mock.calls[0][0]
    expect(call.where).not.toHaveProperty('ownerId')
    expect(call.where.organizationId).toBe('org-1')
  })

  it('admin can search all org contacts', async () => {
    mockRequireApiSession.mockResolvedValue({ user: ADMIN_USER } as any)
    mockPrisma.contact.findMany.mockResolvedValue([])

    const tool = getContactInfoTool()
    await tool.execute({ nameOrEmail: 'john' })

    const call = mockPrisma.contact.findMany.mock.calls[0][0]
    expect(call.where).not.toHaveProperty('ownerId')
    expect(call.where.organizationId).toBe('org-1')
  })
})

describe('getUpcomingMeetings tool — scope enforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.meeting.findMany.mockResolvedValue([])
  })

  it('all users see org-wide meetings regardless of role', async () => {
    mockRequireApiSession.mockResolvedValue({ user: EMPLOYEE_USER } as any)

    const tool = getUpcomingMeetingsTool()
    await tool.execute({ when: 'today' })

    const call = mockPrisma.meeting.findMany.mock.calls[0][0]
    expect(call.where.organizationId).toBe('org-1')
    expect(call.where).not.toHaveProperty('createdById')
    expect(call.where).not.toHaveProperty('OR')
  })

  it('admin can see all org meetings', async () => {
    mockRequireApiSession.mockResolvedValue({ user: ADMIN_USER } as any)

    const tool = getUpcomingMeetingsTool()
    await tool.execute({ when: 'week' })

    const call = mockPrisma.meeting.findMany.mock.calls[0][0]
    expect(call.where.organizationId).toBe('org-1')
    expect(call.where).not.toHaveProperty('createdById')
    expect(call.where).not.toHaveProperty('OR')
  })
})

describe('buildVoiceTools / buildVoiceAgent', () => {
  it('exposes exactly 14 tools with correct names', () => {
    const tools = buildVoiceTools()
    expect(tools).toHaveLength(14)
    expect(tools.map((t) => t.name)).toEqual([
      'getTodaysActivitySummary',
      'getCrmSummary',
      'getDealStatus',
      'getContactInfo',
      'getLeadInfo',
      'getEmployeeInfo',
      'getVisitInfo',
      'getUpcomingMeetings',
      'getFieldSalesSummary',
      'getEmployeeReports',
      'getVisitHistory',
      'getCheckInInfo',
      'getLiveLocation',
      'getReportSummary',
    ])
  })

  it('builds agent with correct name and voice-scoped instructions', () => {
    const agent = buildVoiceAgent()
    expect(agent.name).toBe('crm-voice-assistant')
    expect(agent.model).toBe('gpt-4o-mini')
    expect(agent.maxTurns).toBe(10)
    expect(agent.instructions).toContain('authorized to see')
    expect(agent.instructions).toContain('2-4 sentences')
  })
})

describe('tool types', () => {
  it('getTodaysActivitySummary has scope parameter', () => {
    const tool = getTodaysActivitySummaryTool()
    expect(tool.parameters).toBeDefined()
    expect(tool.name).toBe('getTodaysActivitySummary')
  })

  it('getCrmSummary has scope parameter', () => {
    const tool = getCrmSummaryTool()
    expect(tool.parameters).toBeDefined()
    expect(tool.name).toBe('getCrmSummary')
  })

  it('getDealStatus has dealNameOrId parameter', () => {
    const tool = getDealStatusTool()
    expect(tool.parameters).toBeDefined()
    expect(tool.name).toBe('getDealStatus')
  })

  it('getContactInfo has nameOrEmail parameter', () => {
    const tool = getContactInfoTool()
    expect(tool.parameters).toBeDefined()
    expect(tool.name).toBe('getContactInfo')
  })

  it('getUpcomingMeetings has when parameter', () => {
    const tool = getUpcomingMeetingsTool()
    expect(tool.parameters).toBeDefined()
    expect(tool.name).toBe('getUpcomingMeetings')
  })
})

describe('ToolDefinition type', () => {
  it('all tools implement ToolDefinition', () => {
    const tools = buildVoiceTools()
    for (const t of tools) {
      expect(t.name).toBeDefined()
      expect(t.description).toBeDefined()
      expect(t.parameters).toBeDefined()
      expect(typeof t.execute).toBe('function')
    }
  })
})
