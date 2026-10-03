import 'server-only'
import { prisma } from '@/lib/db'
import { requireApiSession } from '@/lib/session'
import { z } from 'zod'
import { openai, createClient, defineAgent, runAgent as sdkRunAgent } from 'samai-sdk'
import type { RunResult, ToolDefinition } from 'samai-sdk'
import type { Session } from '@/lib/auth'
import type { Prisma } from '@/generated/prisma'

export type VoiceScope = 'me' | 'team' | 'org'

const FULL_VISIBILITY_ROLES = ['SUPER_ADMIN', 'ADMIN']

export function isAdmin(user: Session['user']): boolean {
  return (user.roles ?? []).some((r) => FULL_VISIBILITY_ROLES.includes(r))
}

export function resolveVoiceScope(): VoiceScope {
  return 'org'
}

interface VoiceScopeFilters {
  ownerFilter: Prisma.LeadWhereInput & Prisma.DealWhereInput & Prisma.FollowUpWhereInput
  contactFilter: Prisma.ContactWhereInput
  activityFilter: Prisma.ActivityWhereInput
  meetingFilter: Prisma.MeetingWhereInput
  visitFilter: Prisma.FieldVisitWhereInput
}

export function buildVoiceScopeFilters(): VoiceScopeFilters {
  return {
    ownerFilter: {},
    contactFilter: {},
    activityFilter: {},
    meetingFilter: {},
    visitFilter: {},
  }
}

const startOfDay = (d: Date = new Date()): Date => {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

// ============================================================
// Tool 1: getTodaysActivitySummary
// ============================================================

const todaysActivitySummarySchema = z.object({
  scope: z.enum(['org', 'team', 'me']).optional(),
})

export async function getTodaysActivitySummaryData(
  user: Session['user'],
): Promise<string> {
  const orgId = user.organizationId
  const today = startOfDay()
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const filters = buildVoiceScopeFilters()

  const [activities, leadsAdded, dealsUpdated, meetingsCompleted, followUpsCompleted, visitsLogged] = await Promise.all([
    prisma.activity.findMany({
      where: {
        organizationId: orgId,
        ...filters.activityFilter,
        createdAt: { gte: today, lt: tomorrow },
      },
      include: { lead: { select: { name: true } }, company: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 30,
    }),
    prisma.lead.count({
      where: {
        organizationId: orgId,
        ...filters.ownerFilter,
        createdAt: { gte: today, lt: tomorrow },
      },
    }),
    prisma.deal.count({
      where: {
        organizationId: orgId,
        ...filters.ownerFilter,
        updatedAt: { gte: today, lt: tomorrow },
      },
    }),
    prisma.meeting.count({
      where: {
        organizationId: orgId,
        ...filters.meetingFilter,
        status: 'COMPLETED',
        updatedAt: { gte: today, lt: tomorrow },
      },
    }),
    prisma.followUp.count({
      where: {
        organizationId: orgId,
        ...filters.ownerFilter,
        status: 'COMPLETED',
        completedAt: { gte: today, lt: tomorrow },
      },
    }),
    prisma.fieldVisit.count({
      where: {
        organizationId: orgId,
        ...filters.visitFilter,
        status: 'COMPLETED',
        completedAt: { gte: today, lt: tomorrow },
      },
    }),
  ])

  const activityTypes = new Map<string, number>()
  for (const a of activities) {
    activityTypes.set(a.type, (activityTypes.get(a.type) ?? 0) + 1)
  }

  return JSON.stringify({
    summary: {
      leadsAdded,
      dealsUpdated,
      meetingsCompleted,
      followUpsCompleted,
      visitsLogged,
      activityCount: activities.length,
      recentActivityTypes: Array.from(activityTypes.entries()),
    },
    recentActivities: activities.map((a) => ({
      type: a.type,
      description: a.description,
      company: a.company?.name ?? a.lead?.name ?? null,
    })),
  })
}

export function getTodaysActivitySummaryTool(): ToolDefinition {
  return {
    name: 'getTodaysActivitySummary',
    description:
      "Counts and describes what the caller created, updated, or completed today (leads added, deals stage-changed, meetings held, follow-ups completed, field visits logged, general activity notes). Returns JSON.",
    parameters: todaysActivitySummarySchema,
    execute: async () => {
      const session = await requireApiSession()
      return getTodaysActivitySummaryData(session.user)
    },
  }
}

// ============================================================
// Tool 2: getCrmSummary
// ============================================================

const crmSummarySchema = z.object({
  scope: z.enum(['org', 'team', 'me']).optional(),
})

export async function getCrmSummaryData(
  user: Session['user'],
): Promise<string> {
  const orgId = user.organizationId
  const filters = buildVoiceScopeFilters()
  const now = new Date()

  const [pipelineByStage, openLeadsCount, upcomingMeetings, overdueFollowUps] = await Promise.all([
    prisma.deal.groupBy({
      by: ['stage'],
      where: {
        organizationId: orgId,
        ...filters.ownerFilter,
        stage: { notIn: ['WON', 'LOST'] },
      },
      _count: { _all: true },
      _sum: { value: true },
    }),
    prisma.lead.count({
      where: {
        organizationId: orgId,
        ...filters.ownerFilter,
        status: { notIn: ['WON', 'LOST'] },
      },
    }),
    prisma.meeting.findMany({
      where: {
        organizationId: orgId,
        ...filters.meetingFilter,
        scheduledAt: { gt: now },
        status: { in: ['SCHEDULED', 'PROCESSING'] },
      },
      include: { company: { select: { name: true } } },
      orderBy: { scheduledAt: 'asc' },
      take: 10,
    }),
    prisma.followUp.findMany({
      where: {
        organizationId: orgId,
        ...filters.ownerFilter,
        status: 'PENDING',
        dueDate: { lt: now },
      },
      include: { company: { select: { name: true } }, lead: { select: { name: true } }, deal: { select: { name: true } } },
      orderBy: { dueDate: 'asc' },
      take: 10,
    }),
  ])

  const pipelineValue = pipelineByStage.reduce((sum, row) => sum + Number(row._sum.value ?? 0), 0)
  const totalOpenDeals = pipelineByStage.reduce((sum, row) => sum + row._count._all, 0)

  return JSON.stringify({
    pipeline: {
      totalValue: pipelineValue,
      totalOpenDeals,
      byStage: pipelineByStage.map((row) => ({ stage: row.stage, count: row._count._all, value: Number(row._sum.value ?? 0) })),
    },
    openLeads: openLeadsCount,
    upcomingMeetings: upcomingMeetings.map((m) => ({
      title: m.title,
      scheduledAt: m.scheduledAt?.toISOString() ?? null,
      company: m.company?.name ?? null,
      status: m.status,
    })),
    overdueFollowUps: overdueFollowUps.map((f) => ({
      title: f.title,
      dueDate: f.dueDate.toISOString(),
      linkedTo: f.company?.name ?? f.lead?.name ?? f.deal?.name ?? null,
    })),
  })
}

export function getCrmSummaryTool(): ToolDefinition {
  return {
    name: 'getCrmSummary',
    description: 'An overview of the CRM: pipeline value and stage breakdown, open leads count, upcoming meetings, and overdue follow-ups. Returns JSON.',
    parameters: crmSummarySchema,
    execute: async () => {
      const session = await requireApiSession()
      return getCrmSummaryData(session.user)
    },
  }
}

// ============================================================
// Tool 3: getDealStatus
// ============================================================

const dealStatusSchema = z.object({
  dealNameOrId: z.string().min(1),
})

export function getDealStatusTool(): ToolDefinition {
  return {
    name: 'getDealStatus',
    description: 'Look up a deal by exact name or ID. Returns the deal name, value, stage, company, and owner as JSON, or null if not found.',
    parameters: dealStatusSchema,
    execute: async (args) => {
      const session = await requireApiSession()
      const isCuid = /^[0-9a-f]{25}$/.test(args.dealNameOrId)

      if (isCuid) {
        const row = await prisma.deal.findFirst({
          where: {
            id: args.dealNameOrId,
            organizationId: session.user.organizationId,
           },
           include: { company: { select: { name: true } }, owner: { select: { name: true } } },
         })
         if (!row) return JSON.stringify({ deal: null })
        return JSON.stringify({
          deal: {
            id: row.id,
            name: row.name,
            value: Number(row.value),
            stage: row.stage,
            company: row.company?.name ?? null,
            owner: row.owner.name ?? 'Unassigned',
          },
        })
      }

      const rows = await prisma.deal.findMany({
        where: {
        organizationId: session.user.organizationId,
         OR: [
            { name: { equals: args.dealNameOrId, mode: 'insensitive' as const } },
            { name: { contains: args.dealNameOrId, mode: 'insensitive' as const } },
          ],
        },
        include: { company: { select: { name: true } }, owner: { select: { name: true } } },
        orderBy: { value: 'desc' },
        take: 5,
      })

      return JSON.stringify({
        deals: rows.map((row) => ({
          id: row.id,
          name: row.name,
          value: Number(row.value),
          stage: row.stage,
          company: row.company?.name ?? null,
          owner: row.owner.name ?? 'Unassigned',
        })),
      })
    },
  }
}

// ============================================================
// Tool 4: getContactInfo
// ============================================================

const contactInfoSchema = z.object({
  nameOrEmail: z.string().min(1),
})

export function getContactInfoTool(): ToolDefinition {
  return {
    name: 'getContactInfo',
    description: 'Look up a contact by name or email. Returns JSON with contact details or null.',
    parameters: contactInfoSchema,
    execute: async (args) => {
      const session = await requireApiSession()
      const emailMatch = args.nameOrEmail.includes('@')

      const where: Prisma.ContactWhereInput = {
        organizationId: session.user.organizationId,
        OR: emailMatch
          ? [{ email: { equals: args.nameOrEmail, mode: 'insensitive' as const } }]
          : [
              { name: { equals: args.nameOrEmail, mode: 'insensitive' as const } },
              { name: { contains: args.nameOrEmail, mode: 'insensitive' as const } },
              { email: { contains: args.nameOrEmail, mode: 'insensitive' as const } },
            ],
      }

      const rows = await prisma.contact.findMany({
        where,
        include: { company: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 5,
      })

      return JSON.stringify({
        contacts: rows.map((row) => ({
          id: row.id,
          name: row.name,
          email: row.email ?? null,
          phone: row.phone ?? null,
          designation: row.designation ?? null,
          company: row.company?.name ?? null,
        })),
      })
    },
  }
}

// ============================================================
// Tool 5: getUpcomingMeetings
// ============================================================

const upcomingMeetingsSchema = z.object({
  when: z.enum(['today', 'week', 'overdue']).optional(),
})

export function getUpcomingMeetingsTool(): ToolDefinition {
  return {
    name: 'getUpcomingMeetings',
    description: 'Lists meetings the caller can see within a time window: today (default), this week, or overdue (past scheduled time). Returns JSON array of meetings with title, scheduled time, company, and participant count.',
    parameters: upcomingMeetingsSchema,
    execute: async (args) => {
      const session = await requireApiSession()
      const now = new Date()
      const todayStart = startOfDay()
      const weekEnd = new Date(todayStart)
      weekEnd.setDate(weekEnd.getDate() + 7)

      const when = args.when ?? 'today'

      if (when === 'overdue') {
        const rows = await prisma.meeting.findMany({
          where: {
            organizationId: session.user.organizationId,
            ...buildMeetingScopeWhere(),
            scheduledAt: { lt: now },
            status: { in: ['SCHEDULED', 'PROCESSING'] },
          },
          include: { company: { select: { name: true } }, participants: { select: { id: true } } },
          orderBy: { scheduledAt: 'desc' },
          take: 10,
        })
        return JSON.stringify({
          meetings: rows.map((m) => ({
            id: m.id,
            title: m.title,
            scheduledAt: m.scheduledAt?.toISOString() ?? null,
            company: m.company?.name ?? null,
            participantCount: m.participants.length,
            status: m.status,
          })),
        })
      }

      let dateFilter: Prisma.DateTimeFilter
      if (when === 'week') {
        dateFilter = { gte: todayStart, lt: weekEnd }
      } else {
        const tomorrow = new Date(todayStart)
        tomorrow.setDate(tomorrow.getDate() + 1)
        dateFilter = { gte: todayStart, lt: tomorrow }
      }

      const rows = await prisma.meeting.findMany({
        where: {
          organizationId: session.user.organizationId,
            ...buildMeetingScopeWhere(),
          scheduledAt: dateFilter,
          status: { in: ['SCHEDULED', 'PROCESSING', 'IN_PROGRESS'] },
        },
        include: { company: { select: { name: true } }, participants: { select: { id: true } } },
        orderBy: { scheduledAt: 'asc' },
        take: 20,
      })

      return JSON.stringify({
        meetings: rows.map((m) => ({
          id: m.id,
          title: m.title,
          scheduledAt: m.scheduledAt?.toISOString() ?? null,
          company: m.company?.name ?? null,
          participantCount: m.participants.length,
          status: m.status,
        })),
      })
    },
  }
}

// ============================================================
// Tool 6: getLeadInfo
// ============================================================

const leadInfoSchema = z.object({
  nameOrEmail: z.string().min(1),
})

export function getLeadInfoTool(): ToolDefinition {
  return {
    name: 'getLeadInfo',
    description: 'Look up a lead by name or email. Returns JSON with lead details or null.',
    parameters: leadInfoSchema,
    execute: async (args) => {
      const session = await requireApiSession()
      const emailMatch = args.nameOrEmail.includes('@')

      const where: Prisma.LeadWhereInput = {
        organizationId: session.user.organizationId,
        OR: emailMatch
          ? [{ email: { equals: args.nameOrEmail, mode: 'insensitive' as const } }]
          : [
              { name: { equals: args.nameOrEmail, mode: 'insensitive' as const } },
              { name: { contains: args.nameOrEmail, mode: 'insensitive' as const } },
              { email: { contains: args.nameOrEmail, mode: 'insensitive' as const } },
            ],
      }

      const rows = await prisma.lead.findMany({
        where,
        include: { companyRef: { select: { name: true } }, owner: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 5,
      })

      return JSON.stringify({
        leads: rows.map((row) => ({
          id: row.id,
          name: row.name,
          email: row.email ?? null,
          phone: row.phone ?? null,
          status: row.status,
          source: row.source ?? null,
          company: row.company ?? row.companyRef?.name ?? null,
          owner: row.owner?.name ?? 'Unassigned',
        })),
      })
    },
  }
}

// ============================================================
// Tool 7: getEmployeeInfo
// ============================================================

const employeeInfoSchema = z.object({
  nameOrEmail: z.string().min(1),
})

export function getEmployeeInfoTool(): ToolDefinition {
  return {
    name: 'getEmployeeInfo',
    description: 'Look up an employee/team member by name or email. Returns JSON with employee details (name, email, role, department, team).',
    parameters: employeeInfoSchema,
    execute: async (args) => {
      const session = await requireApiSession()
      const emailMatch = args.nameOrEmail.includes('@')

      const where: Prisma.UserWhereInput = {
        organizationId: session.user.organizationId,
        OR: emailMatch
          ? [{ email: { equals: args.nameOrEmail, mode: 'insensitive' as const } }]
          : [
              { name: { equals: args.nameOrEmail, mode: 'insensitive' as const } },
              { name: { contains: args.nameOrEmail, mode: 'insensitive' as const } },
              { email: { contains: args.nameOrEmail, mode: 'insensitive' as const } },
            ],
      }

      const [rows, userRoles] = await Promise.all([
        prisma.user.findMany({
          where,
          include: { department: { select: { name: true } }, team: { select: { name: true } } },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
        prisma.userRole.findMany({
          where: {
            user: { organizationId: session.user.organizationId },
            ...(!emailMatch
              ? {
                  OR: [
                    { user: { name: { equals: args.nameOrEmail, mode: 'insensitive' as const } } },
                    { user: { name: { contains: args.nameOrEmail, mode: 'insensitive' as const } } },
                    { user: { email: { contains: args.nameOrEmail, mode: 'insensitive' as const } } },
                  ],
                }
              : { user: { email: { equals: args.nameOrEmail, mode: 'insensitive' as const } } }),
          },
          include: { role: true },
        }),
      ])

      const rolesByUserId = new Map<string, string[]>()
      for (const ur of userRoles) {
        const existing = rolesByUserId.get(ur.userId) ?? []
        existing.push(ur.role.name)
        rolesByUserId.set(ur.userId, existing)
      }

      return JSON.stringify({
        employees: rows.map((row) => ({
          id: row.id,
          name: row.name,
          email: row.email,
          roles: rolesByUserId.get(row.id) ?? [],
          department: row.department?.name ?? null,
          team: row.team?.name ?? null,
          employeeId: row.employeeId ?? null,
        })),
      })
    },
  }
}

// ============================================================
// Tool 8: getVisitInfo
// ============================================================

const visitInfoSchema = z.object({
  idOrTitle: z.string().min(1),
})

export function getVisitInfoTool(): ToolDefinition {
  return {
    name: 'getVisitInfo',
     description: 'Look up a field visit by ID or title. Returns JSON with visit details.',
    parameters: visitInfoSchema,
    execute: async (args) => {
      const session = await requireApiSession()
      const isCuid = /^[0-9a-f]{25}$/.test(args.idOrTitle)

      const where: Prisma.FieldVisitWhereInput = {
        organizationId: session.user.organizationId,
        ...(isCuid
          ? { id: args.idOrTitle }
          : {
              OR: [
                { title: { equals: args.idOrTitle, mode: 'insensitive' as const } },
                { title: { contains: args.idOrTitle, mode: 'insensitive' as const } },
              ],
            }),
      }

      const rows = await prisma.fieldVisit.findMany({
        where,
        include: { company: { select: { name: true } }, assignee: { select: { name: true } } },
        orderBy: { scheduledAt: 'desc' },
        take: 5,
      })

      return JSON.stringify({
        visits: rows.map((row) => ({
          id: row.id,
          title: row.title,
          status: row.status,
          scheduledAt: row.scheduledAt?.toISOString() ?? null,
          completedAt: row.completedAt?.toISOString() ?? null,
          company: row.company?.name ?? null,
          assignee: row.assignee?.name ?? 'Unassigned',
          purpose: row.purpose ?? null,
        })),
      })
    },
  }
}

// ============================================================
// Tool 9: getFieldSalesSummary
// ============================================================

const fieldSalesSummarySchema = z.object({
  scope: z.enum(['org', 'team', 'me']).optional(),
  dateRange: z.enum(['today', 'week', 'month']).optional(),
})

export function getFieldSalesSummaryTool(): ToolDefinition {
  return {
    name: 'getFieldSalesSummary',
    description: 'Get field sales overview: visits, check-ins, live locations, geo-fences. Returns JSON with field activity summary.',
    parameters: fieldSalesSummarySchema,
    execute: async (args) => {
      const session = await requireApiSession()
      const filters = buildVoiceScopeFilters()
      const orgId = session.user.organizationId

      const todayStart = startOfDay()
      const now = new Date()
      let dateFilter: Prisma.DateTimeFilter
      if (args.dateRange === 'week') {
        const weekStart = new Date(todayStart)
        weekStart.setDate(weekStart.getDate() - 7)
        dateFilter = { gte: weekStart, lte: now }
      } else if (args.dateRange === 'month') {
        const monthStart = new Date(todayStart)
        monthStart.setMonth(monthStart.getMonth() - 1)
        dateFilter = { gte: monthStart, lte: now }
      } else {
        const tomorrow = new Date(todayStart)
        tomorrow.setDate(tomorrow.getDate() + 1)
        dateFilter = { gte: todayStart, lt: tomorrow }
      }

      const [visits, checkIns, liveLocations, geoFences] = await Promise.all([
        prisma.fieldVisit.findMany({
          where: {
            organizationId: orgId,
            ...filters.visitFilter,
            scheduledAt: dateFilter,
          },
          include: {
            company: { select: { name: true } },
            assignee: { select: { name: true } },
            checkIns: { take: 1, orderBy: { createdAt: 'desc' } },
          },
          orderBy: { scheduledAt: 'asc' },
          take: 50,
        }),
        prisma.checkIn.findMany({
          where: {
            visit: { organizationId: orgId, ...filters.visitFilter },
            createdAt: dateFilter,
          },
          include: {
            user: { select: { name: true } },
            visit: { select: { title: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        }),
        prisma.userLiveLocation.findMany({
          where: { organizationId: orgId, isTracking: true },
          include: { user: { select: { name: true } } },
        }),
        prisma.geoFence.findMany({
          where: { organizationId: orgId, isActive: true },
          include: { company: { select: { name: true } } },
        }),
      ])

      const visitStats = visits.reduce((acc, v) => {
        acc[v.status] = (acc[v.status] ?? 0) + 1
        return acc
      }, {} as Record<string, number>)

      const checkedInCount = checkIns.filter((c) => c.verificationStatus === 'VERIFIED').length

      return JSON.stringify({
        fieldSales: {
          dateRange: args.dateRange ?? 'today',
          visits: {
            total: visits.length,
            byStatus: visitStats,
            upcoming: visits.filter((v) => v.status === 'SCHEDULED').length,
            inProgress: visits.filter((v) => v.status === 'ON_THE_WAY' || v.status === 'CHECKED_IN' || v.status === 'IN_MEETING').length,
            completed: visits.filter((v) => v.status === 'COMPLETED').length,
            details: visits.map((v) => ({
              id: v.id,
              title: v.title,
              status: v.status,
              scheduledAt: v.scheduledAt?.toISOString() ?? null,
              company: v.company?.name ?? null,
              assignee: v.assignee?.name ?? 'Unassigned',
              lastCheckIn: v.checkIns[0]?.createdAt.toISOString() ?? null,
            })),
          },
          checkIns: {
            total: checkIns.length,
            verified: checkedInCount,
            pending: checkIns.filter((c) => c.verificationStatus === 'PENDING').length,
            recent: checkIns.map((c) => ({
              id: c.id,
              visitTitle: c.visit.title,
              user: c.user.name,
              status: c.verificationStatus,
              createdAt: c.createdAt.toISOString(),
              distanceFromCustomer: c.distanceFromCustomer?.toString() ?? null,
            })),
          },
          liveTeam: liveLocations.map((l) => ({
            user: l.user.name,
            latitude: l.latitude.toString(),
            longitude: l.longitude.toString(),
            accuracy: l.accuracy?.toString() ?? null,
            speed: l.speed?.toString() ?? null,
            heading: l.heading?.toString() ?? null,
            updatedAt: l.updatedAt.toISOString(),
          })),
          geoFences: geoFences.map((g) => ({
            id: g.id,
            name: g.name,
            latitude: g.latitude.toString(),
            longitude: g.longitude.toString(),
            radius: g.radius,
            company: g.company?.name ?? null,
          })),
        },
      })
    },
  }
}

// ============================================================
// Tool 10: getEmployeeReports
// ============================================================

const employeeReportsSchema = z.object({
  userId: z.string().optional(),
  dateRange: z.enum(['today', 'week', 'month']).optional(),
  scope: z.enum(['org', 'team', 'me']).optional(),
})

export function getEmployeeReportsTool(): ToolDefinition {
  return {
    name: 'getEmployeeReports',
    description: 'Get employee daily reports with work descriptions, completed work, pending work, blockers, and tomorrow plans. Filter by user, date range, and scope.',
    parameters: employeeReportsSchema,
    execute: async (args) => {
      const session = await requireApiSession()
      const filters = buildVoiceScopeFilters()
      const orgId = session.user.organizationId

      const todayStart = startOfDay()
      let dateFilter: Prisma.DateTimeFilter
      if (args.dateRange === 'week') {
        const weekStart = new Date(todayStart)
        weekStart.setDate(weekStart.getDate() - 7)
        dateFilter = { gte: weekStart }
      } else if (args.dateRange === 'month') {
        const monthStart = new Date(todayStart)
        monthStart.setMonth(monthStart.getMonth() - 1)
        dateFilter = { gte: monthStart }
      } else {
        const tomorrow = new Date(todayStart)
        tomorrow.setDate(tomorrow.getDate() + 1)
        dateFilter = { gte: todayStart, lt: tomorrow }
      }

      const where: Prisma.DailyReportWhereInput = {
        organizationId: orgId,
        ...(filters.ownerFilter as object),
        createdAt: dateFilter,
        ...(args.userId ? { userId: args.userId } : {}),
      }

      const reports = await prisma.dailyReport.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, email: true, department: { select: { name: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      })

      return JSON.stringify({
        reports: reports.map((r) => ({
          id: r.id,
          date: r.createdAt.toISOString().split('T')[0],
          user: r.user?.name ?? 'Unknown',
          email: r.user?.email ?? null,
          department: r.user?.department?.name ?? null,
          workDescription: r.workDescription ?? null,
          completedWork: r.completedWork ?? null,
          pendingWork: r.pendingWork ?? null,
          blockers: r.blockers ?? null,
          tomorrowPlan: r.tomorrowPlan ?? null,
          tasksCompletedCount: r.tasksCompletedCount,
          crmRecordsUpdatedCount: r.crmRecordsUpdatedCount,
          leadsWorkedOnCount: r.leadsWorkedOnCount,
          filesUploadedCount: r.filesUploadedCount,
          activeWorkingTimeMinutes: r.activeWorkingTimeMinutes,
          status: r.status,
        })),
        total: reports.length,
      })
    },
  }
}

// ============================================================
// Tool 11: getVisitHistory
// ============================================================

const visitHistorySchema = z.object({
  visitId: z.string().optional(),
  assigneeId: z.string().optional(),
  status: z.enum(['SCHEDULED', 'ON_THE_WAY', 'CHECKED_IN', 'IN_MEETING', 'COMPLETED']).optional(),
  dateRange: z.enum(['today', 'week', 'month', 'all']).optional(),
  scope: z.enum(['org', 'team', 'me']).optional(),
})

export function getVisitHistoryTool(): ToolDefinition {
  return {
    name: 'getVisitHistory',
    description: 'Get complete visit history with check-ins, visit reports, and activity logs. Filter by visit, assignee, status, date range, and scope.',
    parameters: visitHistorySchema,
    execute: async (args) => {
      const session = await requireApiSession()
      const filters = buildVoiceScopeFilters()
      const orgId = session.user.organizationId

      const todayStart = startOfDay()
      let dateFilter: Prisma.DateTimeFilter | undefined
      if (args.dateRange === 'week') {
        const weekStart = new Date(todayStart)
        weekStart.setDate(weekStart.getDate() - 7)
        dateFilter = { gte: weekStart }
      } else if (args.dateRange === 'month') {
        const monthStart = new Date(todayStart)
        monthStart.setMonth(monthStart.getMonth() - 1)
        dateFilter = { gte: monthStart }
      } else if (args.dateRange !== 'all') {
        const tomorrow = new Date(todayStart)
        tomorrow.setDate(tomorrow.getDate() + 1)
        dateFilter = { gte: todayStart, lt: tomorrow }
      }

      const where: Prisma.FieldVisitWhereInput = {
        organizationId: orgId,
        ...(filters.visitFilter as Prisma.FieldVisitWhereInput),
        ...(args.visitId ? { id: args.visitId } : {}),
        ...(args.assigneeId ? { assigneeId: args.assigneeId } : {}),
        ...(args.status ? { status: args.status } : {}),
        ...(dateFilter ? { scheduledAt: dateFilter } : {}),
      }

      const visits = await prisma.fieldVisit.findMany({
        where,
        include: {
          company: { select: { name: true } },
          assignee: { select: { name: true, email: true } },
          checkIns: { orderBy: { createdAt: 'desc' } },
          visitReports: { orderBy: { createdAt: 'desc' } },
        },
        orderBy: { scheduledAt: 'desc' },
        take: 30,
      })

      return JSON.stringify({
        visits: visits.map((v) => ({
          id: v.id,
          title: v.title,
          purpose: v.purpose ?? null,
          status: v.status,
          scheduledAt: v.scheduledAt?.toISOString() ?? null,
          completedAt: v.completedAt?.toISOString() ?? null,
          address: v.address ?? null,
          latitude: v.latitude?.toString() ?? null,
          longitude: v.longitude?.toString() ?? null,
          company: v.company?.name ?? null,
          assignee: { name: v.assignee?.name ?? 'Unassigned', email: v.assignee?.email ?? null },
          checkIns: v.checkIns.map((c) => ({
            id: c.id,
            latitude: c.latitude.toString(),
            longitude: c.longitude.toString(),
            accuracy: c.accuracy?.toString() ?? null,
            distanceFromCustomer: c.distanceFromCustomer?.toString() ?? null,
            verificationStatus: c.verificationStatus,
            photoUrl: c.photoUrl ?? null,
            notes: c.notes ?? null,
            createdAt: c.createdAt.toISOString(),
          })),
          visitReports: v.visitReports.map((r) => ({
            id: r.id,
            purpose: r.purpose,
            discussion: r.discussion ?? null,
            requirements: r.requirements ?? null,
            competitorInfo: r.competitorInfo ?? null,
            customerFeedback: r.customerFeedback ?? null,
            nextSteps: r.nextSteps ?? null,
            createdAt: r.createdAt.toISOString(),
          })),
        })),
        total: visits.length,
      })
    },
  }
}

// ============================================================
// Tool 12: getCheckInInfo
// ============================================================

const checkInInfoSchema = z.object({
  visitId: z.string().optional(),
  userId: z.string().optional(),
  status: z.enum(['PENDING', 'VERIFIED', 'REJECTED']).optional(),
  dateRange: z.enum(['today', 'week', 'month']).optional(),
})

export function getCheckInInfoTool(): ToolDefinition {
  return {
    name: 'getCheckInInfo',
    description: 'Get detailed check-in information with verification status, location, photos, and notes. Filter by visit, user, status, and date range.',
    parameters: checkInInfoSchema,
    execute: async (args) => {
      const session = await requireApiSession()
      const orgId = session.user.organizationId

      const todayStart = startOfDay()
      let dateFilter: Prisma.DateTimeFilter
      if (args.dateRange === 'week') {
        const weekStart = new Date(todayStart)
        weekStart.setDate(weekStart.getDate() - 7)
        dateFilter = { gte: weekStart }
      } else if (args.dateRange === 'month') {
        const monthStart = new Date(todayStart)
        monthStart.setMonth(monthStart.getMonth() - 1)
        dateFilter = { gte: monthStart }
      } else {
        const tomorrow = new Date(todayStart)
        tomorrow.setDate(tomorrow.getDate() + 1)
        dateFilter = { gte: todayStart, lt: tomorrow }
      }

      const where: Prisma.CheckInWhereInput = {
        visit: { organizationId: orgId },
        createdAt: dateFilter,
        ...(args.visitId ? { visitId: args.visitId } : {}),
        ...(args.userId ? { userId: args.userId } : {}),
        ...(args.status ? { verificationStatus: args.status } : {}),
      }

      const checkIns = await prisma.checkIn.findMany({
        where,
        include: {
          user: { select: { name: true, email: true } },
          visit: { select: { title: true, company: { select: { name: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      })

      return JSON.stringify({
        checkIns: checkIns.map((c) => ({
          id: c.id,
          visitTitle: c.visit.title,
          company: c.visit.company?.name ?? null,
          user: { name: c.user.name, email: c.user.email },
          latitude: c.latitude.toString(),
          longitude: c.longitude.toString(),
          accuracy: c.accuracy?.toString() ?? null,
          distanceFromCustomer: c.distanceFromCustomer?.toString() ?? null,
          verificationStatus: c.verificationStatus,
          photoUrl: c.photoUrl ?? null,
          notes: c.notes ?? null,
          createdAt: c.createdAt.toISOString(),
        })),
        total: checkIns.length,
      })
    },
  }
}

// ============================================================
// Tool 13: getLiveLocation
// ============================================================

const liveLocationSchema = z.object({
  userId: z.string().optional(),
})

export function getLiveLocationTool(): ToolDefinition {
  return {
    name: 'getLiveLocation',
    description: 'Get live GPS locations of field team members who are currently tracking. Returns real-time coordinates, accuracy, speed, and heading.',
    parameters: liveLocationSchema,
    execute: async (args) => {
      const session = await requireApiSession()
      const orgId = session.user.organizationId

      const where: Prisma.UserLiveLocationWhereInput = {
        organizationId: orgId,
        isTracking: true,
        ...(args.userId ? { userId: args.userId } : {}),
      }

      const locations = await prisma.userLiveLocation.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, email: true, department: { select: { name: true } } } },
        },
      })

      return JSON.stringify({
        liveLocations: locations.map((l) => ({
          user: {
            id: l.user.id,
            name: l.user.name,
            email: l.user.email,
            department: l.user.department?.name ?? null,
          },
          latitude: l.latitude.toString(),
          longitude: l.longitude.toString(),
          accuracy: l.accuracy?.toString() ?? null,
          heading: l.heading?.toString() ?? null,
          speed: l.speed?.toString() ?? null,
          isTracking: l.isTracking,
          updatedAt: l.updatedAt.toISOString(),
        })),
        total: locations.length,
      })
    },
  }
}

// ============================================================
// Tool 14: getReportSummary
// ============================================================

const reportSummarySchema = z.object({
  type: z.enum(['daily', 'weekly', 'monthly', 'pipeline', 'activity', 'conversion']).optional(),
  scope: z.enum(['org', 'team', 'me']).optional(),
})

export function getReportSummaryTool(): ToolDefinition {
  return {
    name: 'getReportSummary',
    description: 'Get a summary of available reports: daily reports, pipeline reports, activity reports, conversion reports. Returns JSON with report data.',
    parameters: reportSummarySchema,
    execute: async () => {
      const session = await requireApiSession()
      const orgId = session.user.organizationId

      const todayStart = startOfDay()
      const weekStart = new Date(todayStart)
      weekStart.setDate(weekStart.getDate() - 7)
      const monthStart = new Date(todayStart)
      monthStart.setMonth(monthStart.getMonth() - 1)

      const [dailyReports, pipelineValue, activityCount, conversionStats] = await Promise.all([
        prisma.dailyReport.findMany({
          where: {
            organizationId: orgId,
            createdAt: { gte: weekStart },
          },
          include: { user: { select: { name: true } } },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
        prisma.deal.groupBy({
          by: ['stage'],
          where: {
            organizationId: orgId,
            stage: { notIn: ['WON', 'LOST'] },
          },
          _count: { _all: true },
          _sum: { value: true },
        }),
        prisma.activity.count({
          where: {
            organizationId: orgId,
            createdAt: { gte: weekStart },
          },
        }),
        prisma.deal.groupBy({
          by: ['stage'],
          where: {
            organizationId: orgId,
          },
          _count: { _all: true },
        }),
      ])

      const totalPipeline = pipelineValue.reduce((sum, r) => sum + Number(r._sum.value ?? 0), 0)
      const totalOpenDeals = pipelineValue.reduce((sum, r) => sum + r._count._all, 0)
      const totalDeals = conversionStats.reduce((sum, r) => sum + r._count._all, 0)
      const wonDeals = conversionStats.find((r) => r.stage === 'WON')?._count._all ?? 0
      const conversionRate = totalDeals > 0 ? ((wonDeals / totalDeals) * 100).toFixed(1) : '0'

      return JSON.stringify({
        reports: {
          dailyReports: dailyReports.map((r) => ({
            id: r.id,
            date: r.createdAt.toISOString().split('T')[0],
            user: r.user?.name ?? 'Unknown',
            summary: r.workDescription ?? r.completedWork ?? null,
          })),
          pipeline: {
            totalValue: totalPipeline,
            totalOpenDeals,
            byStage: pipelineValue.map((r) => ({ stage: r.stage, count: r._count._all, value: Number(r._sum.value ?? 0) })),
          },
          activity: {
            lastWeek: activityCount,
          },
          conversion: {
            rate: `${conversionRate}%`,
            totalDeals,
            wonDeals,
          },
        },
      })
    },
  }
}

function buildMeetingScopeWhere(): Prisma.MeetingWhereInput {
  return {}
}

const VOICE_AGENT_INSTRUCTIONS = `You are a voice assistant inside a CRM dashboard. You have access to all CRM data the current user is authorized to see — already filtered before it reaches you. Never claim to know about data outside what a tool call returned. Keep spoken answers concise — 2-4 sentences unless the user asks for detail.

Available tools:
- getTodaysActivitySummary: today's activity counts (leads, deals, meetings, follow-ups, visits, activities)
- getCrmSummary: pipeline overview, open leads, upcoming meetings, overdue follow-ups
- getDealStatus: look up deal by name or ID
- getContactInfo: look up contact by name or email
- getLeadInfo: look up lead by name or email
- getEmployeeInfo: look up team member/employee by name or email
- getVisitInfo: look up field visit by ID or title
- getUpcomingMeetings: list meetings (today, this week, or overdue)
- getFieldSalesSummary: field sales overview (visits, check-ins, live locations, geo-fences)
- getEmployeeReports: employee daily reports with work descriptions, tasks completed, blockers
- getVisitHistory: complete visit history with check-ins, visit reports, and activity logs
- getCheckInInfo: detailed check-in information with verification status, location, photos
- getLiveLocation: live GPS locations of field team members currently tracking
- getReportSummary: daily reports, pipeline, activity, conversion metrics

When you need specific CRM data, use the tools available to you. Tool results come back as JSON strings — parse them and summarize the key facts in plain English for the user's spoken response.`

const VOICE_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini'

export type VoiceTool = ReturnType<typeof getTodaysActivitySummaryTool>

export function buildVoiceTools(): VoiceTool[] {
  return [
    getTodaysActivitySummaryTool(),
    getCrmSummaryTool(),
    getDealStatusTool(),
    getContactInfoTool(),
    getLeadInfoTool(),
    getEmployeeInfoTool(),
    getVisitInfoTool(),
    getUpcomingMeetingsTool(),
    getFieldSalesSummaryTool(),
    getEmployeeReportsTool(),
    getVisitHistoryTool(),
    getCheckInInfoTool(),
    getLiveLocationTool(),
    getReportSummaryTool(),
  ]
}

export function buildVoiceAgent(tools: VoiceTool[] = buildVoiceTools()) {
  return defineAgent({
    name: 'crm-voice-assistant',
    instructions: VOICE_AGENT_INSTRUCTIONS,
    model: VOICE_MODEL,
    tools,
  })
}

export function buildVoiceClient() {
  return createClient({
    provider: openai({ apiKey: process.env.OPENAI_API_KEY }),
  })
}

export async function runVoiceAgent(transcript: string): Promise<{ answerText: string }> {
  const client = buildVoiceClient()
  const agent = buildVoiceAgent()
  const result: RunResult<string> = await sdkRunAgent(client, agent, transcript, {
    defaultToolTimeoutMs: 15000,
  })
  return { answerText: result.text }
}

