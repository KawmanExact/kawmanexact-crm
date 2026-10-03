import 'server-only'
import { prisma } from '@/lib/db'
import { requireApiSession } from '@/lib/session'
import { generateCompletion, isAIConfigured, type AIChatMessage } from '@/lib/ai'
import { getRecordScope } from '@/lib/record-scope'
import type { Session } from '@/lib/auth'
import type { Prisma } from '@/generated/prisma'
import { ok, err, Result } from '@/lib/result'

// ============================================================
// Org data grounding — pulls a real CRM snapshot so the model
// answers from actual pipeline data instead of guessing.
// Scoped to caller visibility (ALL / DEPARTMENT / OWN) so a
// non-admin never sees org-wide aggregates via the AI.
// ============================================================

function scopeFilterForAI(user: Session['user']): { ownerFilter: Prisma.LeadWhereInput; dealOwnerFilter: Prisma.DealWhereInput; followUpOwnerFilter: Prisma.FollowUpWhereInput; visitAssigneeFilter: Prisma.FieldVisitWhereInput; meetingOwnerFilter: Prisma.MeetingWhereInput; userWhere: Prisma.UserWhereInput } {
  const scope = getRecordScope(user)
  if (scope === 'ALL') return { ownerFilter: {}, dealOwnerFilter: {}, followUpOwnerFilter: {}, visitAssigneeFilter: {}, meetingOwnerFilter: {}, userWhere: {} }
  if (scope === 'DEPARTMENT' && user.department?.id) {
    const deptLead = { owner: { departmentId: user.department.id } } as unknown as Prisma.LeadWhereInput
    const deptAssignee = { assignee: { departmentId: user.department.id } } as unknown as Prisma.FieldVisitWhereInput
    const deptMeeting = { createdBy: { departmentId: user.department.id } } as unknown as Prisma.MeetingWhereInput
    return { ownerFilter: deptLead, dealOwnerFilter: deptLead as unknown as Prisma.DealWhereInput, followUpOwnerFilter: { owner: { departmentId: user.department.id } } as unknown as Prisma.FollowUpWhereInput, visitAssigneeFilter: deptAssignee, meetingOwnerFilter: deptMeeting, userWhere: { OR: [{ departmentId: user.department.id }, { id: user.id }] } as Prisma.UserWhereInput }
  }
  return { ownerFilter: { ownerId: user.id } as Prisma.LeadWhereInput, dealOwnerFilter: { ownerId: user.id } as Prisma.DealWhereInput, followUpOwnerFilter: { ownerId: user.id } as Prisma.FollowUpWhereInput, visitAssigneeFilter: { assigneeId: user.id } as Prisma.FieldVisitWhereInput, meetingOwnerFilter: { createdById: user.id } as Prisma.MeetingWhereInput, userWhere: { id: user.id } as Prisma.UserWhereInput }
}

async function buildOrgContext(organizationId: string, user?: Session['user']): Promise<string> {
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const weekStart = new Date(today)
  weekStart.setDate(weekStart.getDate() - weekStart.getDay())
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 7)

  const s = user ? scopeFilterForAI(user) : null
  const leadWhere: Prisma.LeadWhereInput = { organizationId, ...(s?.ownerFilter ?? {}) }
  const dealWhere: Prisma.DealWhereInput = { organizationId, ...(s?.dealOwnerFilter ?? {}) }
  const followUpWhere: Prisma.FollowUpWhereInput = { organizationId, ...(s?.followUpOwnerFilter ?? {}) }
  const visitWhere: Prisma.FieldVisitWhereInput = { organizationId, ...(s?.visitAssigneeFilter ?? {}) }
  const meetingWhere: Prisma.MeetingWhereInput = { organizationId, ...(s?.meetingOwnerFilter ?? {}) }

  // Employee-level data (daily reports, activities, users) is scoped the same way:
  // admins see everything, managers see their department, others see only themselves.
  let drUserFilter: Prisma.DailyReportWhereInput = {}
  let activityActorFilter: Prisma.ActivityWhereInput = {}
  if (user) {
    const scope = getRecordScope(user)
    if (scope === 'DEPARTMENT' && user.department?.id) {
      drUserFilter = { user: { departmentId: user.department.id } }
      activityActorFilter = { actor: { departmentId: user.department.id } }
    } else if (scope === 'OWN') {
      drUserFilter = { userId: user.id }
      activityActorFilter = { actorId: user.id }
    }
  }

  const [
    leadsByStatus,
    dealsByStage,
    wonThisMonth,
    followUpsOverdue,
    topOpenDeals,
    recentLeads,
    todaysVisits,
    upcomingVisits,
    completedVisitsToday,
    visitsThisWeek,
    todaysCheckIns,
    todaysVisitReports,
    todaysMeetings,
    upcomingMeetings,
    teamMembers,
    todaysDailyReports,
    todaysActivities,
  ] = await Promise.all([
    prisma.lead.groupBy({ by: ['status'], where: leadWhere, _count: { _all: true } }),
    prisma.deal.groupBy({ by: ['stage'], where: dealWhere, _count: { _all: true }, _sum: { value: true } }),
    prisma.deal.aggregate({ where: { ...dealWhere, stage: 'WON', closedAt: { gte: monthStart } }, _sum: { value: true }, _count: { _all: true } }),
    prisma.followUp.count({ where: { ...followUpWhere, status: { in: ['PENDING', 'OVERDUE'] }, dueDate: { lt: tomorrow } } }),
    prisma.deal.findMany({ where: { ...dealWhere, stage: { notIn: ['WON', 'LOST'] } }, orderBy: { value: 'desc' }, take: 8, select: { name: true, value: true, stage: true, probability: true, expectedClose: true } }),
    prisma.lead.findMany({ where: leadWhere, orderBy: { createdAt: 'desc' }, take: 5, select: { name: true, company: true, status: true, source: true, createdAt: true } }),
    prisma.fieldVisit.findMany({ where: { ...visitWhere, scheduledAt: { gte: today, lt: tomorrow } }, include: { assignee: { select: { id: true, name: true, email: true } }, company: { select: { name: true } }, contact: { select: { name: true } }, deal: { select: { name: true, value: true } } }, orderBy: { scheduledAt: 'asc' } }),
    prisma.fieldVisit.findMany({ where: { ...visitWhere, scheduledAt: { gte: tomorrow, lt: weekEnd }, status: { in: ['SCHEDULED', 'ON_THE_WAY'] } }, include: { assignee: { select: { id: true, name: true } }, company: { select: { name: true } } }, orderBy: { scheduledAt: 'asc' }, take: 10 }),
    prisma.fieldVisit.findMany({ where: { ...visitWhere, scheduledAt: { gte: today, lt: tomorrow }, status: 'COMPLETED' }, include: { assignee: { select: { id: true, name: true } }, company: { select: { name: true } }, visitReports: { select: { purpose: true, discussion: true, nextSteps: true, createdAt: true } } } }),
    prisma.fieldVisit.groupBy({ by: ['status'], where: { ...visitWhere, scheduledAt: { gte: weekStart, lt: weekEnd } }, _count: { _all: true } }),
    prisma.checkIn.findMany({ where: { createdAt: { gte: today, lt: tomorrow } }, include: { user: { select: { id: true, name: true } }, visit: { select: { id: true, title: true, company: { select: { name: true } }, assignee: { select: { name: true } } } } }, orderBy: { createdAt: 'desc' } }),
    prisma.visitReport.findMany({ where: { createdAt: { gte: today, lt: tomorrow } }, include: { visit: { select: { id: true, title: true, assignee: { select: { name: true } }, company: { select: { name: true } } } }, createdBy: { select: { name: true } } } }),
    prisma.meeting.findMany({ where: { ...meetingWhere, scheduledAt: { gte: today, lt: tomorrow } }, include: { createdBy: { select: { name: true } }, company: { select: { name: true } }, participants: { include: { user: { select: { name: true } } } } }, orderBy: { scheduledAt: 'asc' } }),
    prisma.meeting.findMany({ where: { ...meetingWhere, scheduledAt: { gte: tomorrow, lt: weekEnd }, status: { in: ['PROCESSING', 'SCHEDULED'] } }, include: { createdBy: { select: { name: true } }, company: { select: { name: true } } }, orderBy: { scheduledAt: 'asc' }, take: 10 }),
    prisma.user.findMany({ where: { organizationId, status: 'ACTIVE', ...(s?.userWhere ?? {}) }, select: { id: true, name: true, email: true, designation: true, department: { select: { name: true } }, team: { select: { name: true } }, status: true, roles: { select: { role: { select: { name: true } } } } }, orderBy: { name: 'asc' } }),
    prisma.dailyReport.findMany({ where: { organizationId, date: { gte: today, lt: tomorrow }, ...drUserFilter }, include: { user: { select: { name: true, email: true, designation: true, department: { select: { name: true } } } } }, orderBy: { createdAt: 'desc' } }),
    prisma.activity.findMany({ where: { organizationId, createdAt: { gte: today, lt: tomorrow }, ...activityActorFilter }, include: { actor: { select: { name: true, email: true, designation: true } }, lead: { select: { name: true } }, company: { select: { name: true } }, contact: { select: { name: true } }, deal: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: 30 }),
  ])

  const fmt = (n: number) => `₹${Number(n).toLocaleString('en-IN')}`

  const lines: string[] = []
  lines.push('=== Live CRM Snapshot (Kawman ExAct) ===')
  lines.push(`Generated: ${new Date().toISOString()}`)
  lines.push('')

  lines.push('Leads by status: ' + (leadsByStatus.map((r) => `${r.status}=${r._count._all}`).join(', ') || 'none'))
  lines.push('Deal pipeline by stage: ' + (dealsByStage.map((r) => `${r.stage}=${r._count._all} deals worth ${fmt(Number(r._sum.value ?? 0))}`).join('; ') || 'none'))
  lines.push(`Won this month: ${wonThisMonth._count._all} deals worth ${fmt(Number(wonThisMonth._sum.value ?? 0))}`)
  lines.push(`Follow-ups overdue or due today: ${followUpsOverdue}`)
  lines.push('')

  // Field Visits Today
  lines.push(`Field visits scheduled today: ${todaysVisits.length}`)
  if (todaysVisits.length > 0) {
    lines.push("Today's visits:")
    for (const v of todaysVisits) {
      const assignee = v.assignee?.name ?? 'Unassigned'
      const company = v.company?.name ?? v.contact?.name ?? 'No company'
      const deal = v.deal ? ` (Deal: ${v.deal.name}, ${fmt(Number(v.deal.value))})` : ''
      lines.push(`  - ${v.title} @ ${v.scheduledAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} — ${assignee} → ${company}${deal} [${v.status}]`)
      if (v.purpose) lines.push(`    Purpose: ${v.purpose}`)
      if (v.address) lines.push(`    Address: ${v.address}`)
    }
  }
  lines.push('')

  // Upcoming Visits This Week
  if (upcomingVisits.length > 0) {
    lines.push(`Upcoming visits this week: ${upcomingVisits.length}`)
    for (const v of upcomingVisits) {
      const assignee = v.assignee?.name ?? 'Unassigned'
      const company = v.company?.name ?? 'No company'
      const day = v.scheduledAt.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
      lines.push(`  - ${day} ${v.scheduledAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} — ${assignee} → ${company} [${v.status}]`)
    }
    lines.push('')
  }

  // Completed Visits Today
  if (completedVisitsToday.length > 0) {
    lines.push(`Visits completed today: ${completedVisitsToday.length}`)
    for (const v of completedVisitsToday) {
      const assignee = v.assignee?.name ?? 'Unknown'
      const company = v.company?.name ?? 'No company'
      lines.push(`  - ${v.title} — ${assignee} → ${company}`)
      for (const r of v.visitReports) {
        lines.push(`    Report: ${r.purpose}`)
        if (r.discussion) lines.push(`    Discussion: ${r.discussion.slice(0, 200)}`)
        if (r.nextSteps) lines.push(`    Next steps: ${r.nextSteps.slice(0, 200)}`)
      }
    }
    lines.push('')
  }

  // Visits This Week Summary
  if (visitsThisWeek.length > 0) {
    lines.push('Visits this week by status: ' + visitsThisWeek.map((r) => `${r.status}=${r._count._all}`).join(', '))
    lines.push('')
  }

  // Check-ins Today
  if (todaysCheckIns.length > 0) {
    lines.push(`Check-ins today: ${todaysCheckIns.length}`)
    const verified = todaysCheckIns.filter((c) => c.verificationStatus === 'VERIFIED').length
    const pending = todaysCheckIns.filter((c) => c.verificationStatus === 'PENDING').length
    lines.push(`  Verified: ${verified} | Pending: ${pending}`)
    for (const c of todaysCheckIns.slice(0, 5)) {
      const user = c.user?.name ?? 'Unknown'
      const visit = c.visit?.title ?? 'Unknown visit'
      const company = c.visit?.company?.name ?? 'No company'
      lines.push(`  - ${user} checked in at "${visit}" (${company}) [${c.verificationStatus}]`)
    }
  }

  // Visit Reports Today
  if (todaysVisitReports.length > 0) {
    lines.push(`Visit reports filed today: ${todaysVisitReports.length}`)
    for (const r of todaysVisitReports) {
      const visit = r.visit?.title ?? 'Unknown visit'
      const assignee = r.visit?.assignee?.name ?? 'Unknown'
      const company = r.visit?.company?.name ?? 'No company'
      const createdBy = r.createdBy?.name ?? 'Unknown'
      lines.push(`  - "${visit}" by ${assignee} (${company}) — Filed by ${createdBy}`)
      if (r.purpose) lines.push(`    Purpose: ${r.purpose}`)
      if (r.discussion) lines.push(`    Discussion: ${r.discussion.slice(0, 200)}`)
      if (r.requirements) lines.push(`    Requirements: ${r.requirements.slice(0, 200)}`)
      if (r.nextSteps) lines.push(`    Next steps: ${r.nextSteps.slice(0, 200)}`)
    }
    lines.push('')
  }

  // Meetings Today
  if (todaysMeetings.length > 0) {
    lines.push(`Meetings today: ${todaysMeetings.length}`)
    for (const m of todaysMeetings) {
      const time = m.scheduledAt ? m.scheduledAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : 'TBD'
      const participants = m.participants?.map((p) => p.user?.name).filter(Boolean).join(', ') ?? 'None'
      const company = m.company?.name ?? 'No company'
      lines.push(`  - ${time} — ${m.title} (${m.type}) [${m.status}] — ${company}`)
      lines.push(`    Organizer: ${m.createdBy?.name ?? 'Unknown'} | Participants: ${participants}`)
      if (m.notes) lines.push(`    Notes: ${m.notes.slice(0, 200)}`)
    }
    lines.push('')
  }

  // Upcoming Meetings This Week
  if (upcomingMeetings.length > 0) {
    lines.push(`Upcoming meetings this week: ${upcomingMeetings.length}`)
    for (const m of upcomingMeetings) {
      const day = m.scheduledAt ? m.scheduledAt.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) : 'TBD'
      const time = m.scheduledAt ? m.scheduledAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : ''
      const company = m.company?.name ?? 'No company'
      lines.push(`  - ${day} ${time} — ${m.title} (${m.type}) [${m.status}] — ${company}`)
    }
    lines.push('')
  }

  // Top Open Deals
  lines.push('Top open deals by value:')
  for (const d of topOpenDeals) {
    lines.push(`- ${d.name}: ${fmt(Number(d.value))}, stage ${d.stage}, ${d.probability}% probability` + (d.expectedClose ? `, expected close ${d.expectedClose.toISOString().slice(0, 10)}` : ''))
  }
  if (topOpenDeals.length === 0) lines.push('- none')
  lines.push('')

  // Recent Leads
  lines.push('Most recent leads:')
  for (const l of recentLeads) {
    lines.push(`- ${l.name} (${l.company ?? 'no company'}), status ${l.status}, source ${l.source ?? 'unknown'}`)
  }
  if (recentLeads.length === 0) lines.push('- none')
  lines.push('')

  // Team Members (Employee Directory)
  lines.push(`Team members (${teamMembers.length}):`)
  for (const u of teamMembers) {
    const roles = u.roles?.map((r) => r.role.name).join(', ') ?? 'member'
    const dept = u.department?.name ?? '—'
    const team = u.team?.name
    lines.push(`  - ${u.name ?? u.email} (${u.email})${u.designation ? ` · ${u.designation}` : ''} · Dept: ${dept}${team ? ` · Team: ${team}` : ''} [${roles}]`)
  }
  if (teamMembers.length === 0) lines.push('  - none')
  lines.push('')

  // Daily Reports Today
  lines.push(`Daily reports today (${todaysDailyReports.length}):`)
  for (const dr of todaysDailyReports) {
    const emp = dr.user?.name ?? dr.user?.email ?? 'Unknown'
    const dept = dr.user?.department?.name ?? '—'
    lines.push(`  - ${emp} · Dept: ${dept} · Status: ${dr.status} · Date: ${dr.date.toISOString().slice(0, 10)}`)
    if (dr.workDescription) lines.push(`    Work: ${dr.workDescription.slice(0, 300)}`)
    if (dr.completedWork) lines.push(`    Completed: ${dr.completedWork.slice(0, 300)}`)
    if (dr.pendingWork) lines.push(`    Pending: ${dr.pendingWork.slice(0, 300)}`)
    if (dr.blockers) lines.push(`    Blockers: ${dr.blockers.slice(0, 300)}`)
    if (dr.tomorrowPlan) lines.push(`    Tomorrow: ${dr.tomorrowPlan.slice(0, 300)}`)
    lines.push(`    Stats: tasks=${dr.tasksCompletedCount}, crmUpdated=${dr.crmRecordsUpdatedCount}, leadsWorked=${dr.leadsWorkedOnCount}, filesUploaded=${dr.filesUploadedCount}, activeMinutes=${dr.activeWorkingTimeMinutes}`)
  }
  if (todaysDailyReports.length === 0) lines.push('  - No daily reports submitted today.')
  lines.push('')

  // Activities Today
  if (todaysActivities.length > 0) {
    lines.push(`CRM activities today (${todaysActivities.length}):`)
    for (const a of todaysActivities) {
      const actor = a.actor?.name ?? a.actor?.email ?? 'Unknown'
      const target = a.lead?.name ? `lead "${a.lead.name}"` : a.deal?.name ? `deal "${a.deal.name}"` : a.company?.name ? `company "${a.company.name}"` : a.contact?.name ? `contact "${a.contact.name}"` : ''
      const ts = a.createdAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
      lines.push(`  - ${ts} — ${actor} · ${a.type}${target ? ` · ${target}` : ''} · ${a.description.slice(0, 200)}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

function systemPrompt(orgContext: string): string {
  return [
    'You are the AI assistant embedded in Kawman ExAct, a CRM and field-sales platform.',
    'You have access to a live snapshot of the organization\'s CRM data below. Ground your',
    'answers in this data whenever the question relates to leads, deals, pipeline, or follow-ups.',
    'Formatting standards for reports: use ## headings for each section, markdown tables (| col |) for any',
    'comparison or ranking, > blockquote for TL;DR, **bold** for every monetary figure / count / percentage,',
    'and keep paragraphs to max 3 lines. Prefer bullets and tables over prose. Never invent data not in the snapshot.',
    'If the question is unrelated to the CRM data, answer normally without the report template.',
    '',
    orgContext,
  ].join('\n')
}

// ============================================================
// Conversations & messages
// ============================================================

export interface ConversationSummary {
  id: string
  title: string | null
  updatedAt: string
  lastMessagePreview: string | null
}

export async function listConversations(): Promise<ConversationSummary[]> {
  const session = await requireApiSession()
  const rows = await prisma.aIConversation.findMany({
    where: { organizationId: session.user.organizationId, userId: session.user.id },
    orderBy: { updatedAt: 'desc' },
    take: 50,
    include: { messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { content: true } } },
  })
  return rows.map((c) => ({
    id: c.id,
    title: c.title,
    updatedAt: c.updatedAt.toISOString(),
    lastMessagePreview: c.messages[0]?.content?.slice(0, 120) ?? null,
  }))
}

export async function getConversationMessages(conversationId: string) {
  const session = await requireApiSession()
  const conversation = await prisma.aIConversation.findFirst({
    where: { id: conversationId, organizationId: session.user.organizationId, userId: session.user.id },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  })
  if (!conversation) return null
  return {
    id: conversation.id,
    title: conversation.title,
    messages: conversation.messages.map((m) => ({
      id: m.id,
      role: m.role as AIChatMessage['role'],
      content: m.content,
      createdAt: m.createdAt.toISOString(),
    })),
  }
}

export async function deleteConversation(conversationId: string) {
  const session = await requireApiSession()
  await prisma.aIConversation.deleteMany({
    where: { id: conversationId, organizationId: session.user.organizationId, userId: session.user.id },
  })
}

/**
 * Ensures a conversation exists (creating one titled from the first message
 * if `conversationId` is omitted), persists the user's message, and returns
 * everything the chat route needs to call the model: the message history,
 * the grounding system prompt, and the conversation id.
 */
export async function prepareChatTurn(conversationId: string | undefined, userMessage: string) {
  const session = await requireApiSession()
  const organizationId = session.user.organizationId

  let conversation = conversationId
    ? await prisma.aIConversation.findFirst({
        where: { id: conversationId, organizationId, userId: session.user.id },
      })
    : null

  if (!conversation) {
    conversation = await prisma.aIConversation.create({
      data: {
        organizationId,
        userId: session.user.id,
        title: userMessage.slice(0, 60),
      },
    })
  }

  await prisma.aIMessage.create({
    data: { conversationId: conversation.id, role: 'user', content: userMessage },
  })

  const history = await prisma.aIMessage.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: 'asc' },
    take: 40,
  })

  const orgContext = await buildOrgContext(organizationId, session.user)

  return {
    conversationId: conversation.id,
    system: systemPrompt(orgContext),
    messages: history.map((m) => ({ role: m.role as AIChatMessage['role'], content: m.content })),
  }
}

export async function saveAssistantReply(conversationId: string, content: string) {
  await prisma.aIMessage.create({ data: { conversationId, role: 'assistant', content } })
  await prisma.aIConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } })
}

// ============================================================
// Reports
// ============================================================

export const REPORT_TYPES = [
  {
    type: 'PIPELINE_HEALTH',
    title: 'Pipeline Health Report',
    description: 'Stage-by-stage pipeline analysis, stuck deals, and risk flags.',
  },
  {
    type: 'WEEKLY_SALES_SUMMARY',
    title: 'Weekly Sales Summary',
    description: 'Wins, new leads, and rep activity for the past week.',
  },
  {
    type: 'FOLLOW_UP_RISK',
    title: 'Follow-up Risk Report',
    description: 'Overdue follow-ups and leads going cold, ranked by urgency.',
  },
  {
    type: 'EXECUTIVE_SUMMARY',
    title: 'Executive Summary',
    description: 'A one-page, leadership-ready snapshot of leads, pipeline, and revenue.',
  },
] as const

export type ReportType = (typeof REPORT_TYPES)[number]['type']

const REPORT_PROMPTS: Record<ReportType, string> = {
  PIPELINE_HEALTH: [
    'Write a **Pipeline Health Report** as a professional business document.',
    '',
    'Required structure (use exactly these ## headings in order):',
    '## 1. Executive Summary — 2–3 sentences, top-line health and one number that matters most.',
    '## 2. Pipeline by Stage — a markdown table with columns | Stage | Deals | Total Value | Avg Probability | Notes |, then 2–3 bullets interpreting the table (where is it overloaded or stalled).',
    '## 3. At-Risk & Stalled Deals — table | Deal | Stage | Value | Probability | Risk Reason | ranked by risk (largest + lowest probability first).',
    '## 4. Bottleneck Analysis — what stages are blocking flow and why (use snapshot numbers).',
    '## 5. Recommendations — exactly 3 numbered, actionable recommendations (owner + next step + expected impact).',
    '',
    'Formatting rules: Use **bold** for every monetary figure, count, and percentage. Use tables where specified. Keep tone executive, concise, and data-grounded. Do not invent data not in the snapshot.',
  ].join('\n'),
  WEEKLY_SALES_SUMMARY: [
    'Write a **Weekly Sales Summary** as a Monday-morning leadership briefing.',
    '',
    'Required structure (use exactly these ## headings in order):',
    '## 1. At a Glance — a markdown table | Metric | This Week | Notes | covering: new leads, deals won, pipeline movement, overdue follow-ups, field visits today.',
    '## 2. Wins of the Week — bullets for each deal won (name, value, stage movement). If none, say so plainly.',
    '## 3. New Leads & Sources — bullets grouped by source/status with counts.',
    '## 4. Pipeline Movement — what moved forward, what stalled, with 2–3 insight bullets.',
    '## 5. Focus for Next Week — 3 prioritized actions (what, who, by when).',
    '',
    'Formatting rules: Start with a 1-sentence TL;DR in > blockquote. Use **bold** for all numbers. Use tables where specified. Keep scannable; no paragraph longer than 3 lines.',
  ].join('\n'),
  FOLLOW_UP_RISK: [
    'Write a **Follow-up Risk Report** as an urgency-ranked operational brief.',
    '',
    'Required structure (use exactly these ## headings in order):',
    '## 1. Summary — one paragraph: how many follow-ups are overdue/due today and the revenue at risk.',
    '## 2. Overdue & Due Today — markdown table | Lead / Deal | Owner | Due Date | Days Overdue | Urgency | Next Step | sorted by Urgency (High → Medium → Low). Urgency = High if overdue >3 days or high-value deal.',
    '## 3. Going Cold — leads/deals with no touch in the snapshot window that risk going cold (bullets).',
    '## 4. Priority Queue — numbered 1–5, the exact 5 items to act on this week in order.',
    '## 5. Recommendations — 3 bullets to prevent future slippage (process, not just effort).',
    '',
    'Formatting rules: Use **bold** for dates, counts, and values. Use tables where specified. Be direct; no filler.',
  ].join('\n'),
  EXECUTIVE_SUMMARY: [
    'Write a **one-page Executive Summary** for a busy executive (60-second read).',
    '',
    'Required structure (use exactly these ## headings in order):',
    '## 1. TL;DR — a > blockquote with 2 sentences: the single most important win and the single biggest risk right now.',
    '## 2. Key Metrics — markdown table | Metric | Value | Trend / Note | covering: total leads, pipeline value, deals won this month (count + value), overdue follow-ups, field visits today.',
    '## 3. Pipeline Snapshot — 3 bullets interpreting the pipeline by stage.',
    '## 4. Biggest Opportunity — one deal/segment with value, stage, probability, and why it matters (use snapshot).',
    '## 5. Biggest Risk — one risk with impact and mitigation in one sentence.',
    '## 6. What Needs Attention This Week — 3 numbered, owner-ready actions.',
    '',
    'Formatting rules: Entire report must fit one printed page. Use **bold** for every KPI. Prefer tables and bullets over paragraphs. No fluff, no invented data.',
  ].join('\n'),
}

export interface ReportSummary {
  id: string
  type: string
  title: string
  createdAt: string
  generatedByName: string
}

/**
 * employee_daily_summary reports are scoped to the employee they describe
 * — only the employee, SUPER_ADMIN, and ADMIN can see them. Managers and
 * other employees are explicitly excluded.
 */
function canViewEmployeeSummary(
  user: Session['user'],
  dailyReportUserId: string | null | undefined
): boolean {
  if (getRecordScope(user) === 'ALL') return true
  return dailyReportUserId === user.id
}

type AIReportRow = {
  type: string
  generatedById: string
  dailyReport?: { userId: string } | null
}

function canViewReport(user: Session['user'], report: AIReportRow): boolean {
  if (getRecordScope(user) === 'ALL') return true
  if (report.type === 'employee_daily_summary') return canViewEmployeeSummary(user, report.dailyReport?.userId)
  return report.generatedById === user.id
}

export async function listReports(): Promise<ReportSummary[]> {
  const session = await requireApiSession()
  const rows = await prisma.aIReport.findMany({
    where: { organizationId: session.user.organizationId },
    orderBy: { createdAt: 'desc' },
    take: 30,
    include: {
      generatedBy: { select: { name: true } },
      dailyReport: { select: { userId: true } },
    },
  })
  return rows
    .filter((r) => canViewReport(session.user, r))
    .map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      createdAt: r.createdAt.toISOString(),
      generatedByName: r.generatedBy.name ?? 'Unknown',
    }))
}

/** Same as listReports, filtered to a single report type — used by /ai/summary. */
export async function listReportsByType(type: ReportType): Promise<ReportSummary[]> {
  const session = await requireApiSession()
  const rows = await prisma.aIReport.findMany({
    where: { organizationId: session.user.organizationId, type },
    orderBy: { createdAt: 'desc' },
    take: 30,
    include: {
      generatedBy: { select: { name: true } },
      dailyReport: { select: { userId: true } },
    },
  })
  return rows
    .filter((r) => canViewReport(session.user, r))
    .map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      createdAt: r.createdAt.toISOString(),
      generatedByName: r.generatedBy.name ?? 'Unknown',
    }))
}

export async function getReport(id: string) {
  const session = await requireApiSession()
  const row = await prisma.aIReport.findFirst({
    where: { id, organizationId: session.user.organizationId },
    include: {
      generatedBy: { select: { name: true } },
      dailyReport: { select: { userId: true } },
    },
  })
  if (!row) return null
  if (!canViewReport(session.user, row)) return null
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    content: row.content,
    createdAt: row.createdAt.toISOString(),
    generatedByName: row.generatedBy.name ?? 'Unknown',
  }
}

/**
 * Returns the AI daily-summary reports linked to a specific employee's
 * DailyReports. Only the employee themselves (any scope) or an admin-like
 * user (record scope 'ALL') can query another employee's summaries.
 */
export async function listEmployeeReports(userId: string): Promise<ReportSummary[]> {
  const session = await requireApiSession()
  if (userId !== session.user.id && getRecordScope(session.user) !== 'ALL') return []

  const rows = await prisma.aIReport.findMany({
    where: {
      organizationId: session.user.organizationId,
      type: 'employee_daily_summary',
      dailyReport: { userId },
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
    include: {
      generatedBy: { select: { name: true } },
      dailyReport: { select: { userId: true } },
    },
  })
  return rows
    .filter((r) => canViewReport(session.user, r))
    .map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      createdAt: r.createdAt.toISOString(),
      generatedByName: r.generatedBy.name ?? 'Unknown',
    }))
}

export async function generateReport(type: ReportType): Promise<Result<{ id: string }>> {
  const session = await requireApiSession()
  const organizationId = session.user.organizationId
  const meta = REPORT_TYPES.find((r) => r.type === type)
  if (!meta) return err('Unknown report type')

  try {
    const orgContext = await buildOrgContext(organizationId, session.user)
    const content = await generateCompletion(
      [{ role: 'user', content: REPORT_PROMPTS[type] }],
      systemPrompt(orgContext)
    )

    const row = await prisma.aIReport.create({
      data: {
        type,
        title: `${meta.title} — ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`,
        content,
        organizationId,
        generatedById: session.user.id,
      },
    })

    return ok({ id: row.id })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to generate report'
    return err(msg)
  }
}


export async function generateEmployeeDailySummary(dailyReportId: string): Promise<Result<{ id: string }>> {
  const session = await requireApiSession()
  const perms = session.user.permissions as string[]
  if (!perms.includes('team.view') && !perms.includes('team.view_all') && !perms.includes('reports.view') && !perms.includes('reports.view_all') && !perms.includes('reports.submit')) return err('Forbidden: missing team.view')
  const report = await prisma.dailyReport.findFirst({
    where: { id: dailyReportId, organizationId: session.user.organizationId },
    include: { user: { select: { name: true, email: true } } },
  })
  if (!report) return err('Daily report not found')
  if (report.userId !== session.user.id && !perms.includes('team.view_all')) return err('Forbidden: missing team.view_all')
  try {
    const orgContext = await buildOrgContext(session.user.organizationId, session.user)
    const prompt = [
      'Write an **Employee Daily Summary** as a professional status report.',
      'Required structure (use exactly these ## headings):',
      '## 1. Summary — 2 sentences: what was accomplished and overall productivity signal.',
      '## 2. Completed Today — bullets from the completedWork field; include counts inline.',
      '## 3. Pending & Carry-Forward — bullets from pendingWork.',
      '## 4. Blockers & Risks — bullets; if none, write "No blockers reported."',
      '## 5. Plan for Tomorrow — bullets from tomorrowPlan.',
      '## 6. Activity Snapshot — markdown table | Metric | Count | with rows: Tasks Completed, CRM Records Updated, Leads Worked On, Files Uploaded, Active Time (minutes).',
      'Formatting: Use **bold** for all counts. Keep bullets short. Do not invent work not listed.',
      '',
      'Employee: ' + (report.user.name ?? report.user.email),
      'Date: ' + report.date.toISOString().slice(0, 10),
      'Status: ' + report.status,
      'Work description: ' + (report.workDescription ?? '-'),
      'Completed: ' + (report.completedWork ?? '-'),
      'Pending: ' + (report.pendingWork ?? '-'),
      'Blockers: ' + (report.blockers ?? '-'),
      'Tomorrow: ' + (report.tomorrowPlan ?? '-'),
      'Stats: tasksCompleted=' + report.tasksCompletedCount + ', crmUpdated=' + report.crmRecordsUpdatedCount + ', leadsWorkedOn=' + report.leadsWorkedOnCount + ', filesUploaded=' + report.filesUploadedCount + ', activeMinutes=' + report.activeWorkingTimeMinutes,
    ].join('\n')
    const content = await generateCompletion([{ role: 'user', content: prompt }], systemPrompt(orgContext))
    const row = await prisma.aIReport.create({
      data: {
        type: 'employee_daily_summary',
        title: 'Daily Summary — ' + (report.user.name ?? report.user.email) + ' — ' + report.date.toISOString().slice(0, 10),
        content,
        organizationId: session.user.organizationId,
        generatedById: session.user.id,
        dailyReportId: report.id,
      },
    })
    return ok({ id: row.id })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to generate summary'
    return err(msg)
  }
}

export async function generateTeamManagementSummary(dateRange?: { from: Date; to: Date }): Promise<Result<{ id: string }>> {
  const session = await requireApiSession()
  if (!(session.user.permissions as string[]).includes('team.view_all')) return err('Forbidden: missing team.view_all')
  const organizationId = session.user.organizationId
  const from = dateRange?.from ?? new Date(Date.now() - 6 * 86400000)
  const to = dateRange?.to ?? new Date()
  try {
    const reports = await prisma.dailyReport.findMany({
      where: { organizationId, date: { gte: from, lte: to }, status: 'SUBMITTED' },
      include: { user: { select: { name: true, email: true } } },
      orderBy: { date: 'desc' },
      take: 100,
    })
    const total = await prisma.user.count({ where: { organizationId, status: 'ACTIVE' } })
    const todayKey = new Date().toISOString().slice(0, 10)
    const submittedTodayCount = reports.filter((r) => r.date.toISOString().slice(0, 10) === todayKey).length
    const orgContext = await buildOrgContext(organizationId, session.user)
    const reportLines = reports.slice(0, 30).map((r) => '- ' + (r.user.name ?? r.user.email) + ' (' + r.date.toISOString().slice(0, 10) + '): ' + (r.workDescription ?? r.completedWork ?? '-') + ' | blockers: ' + (r.blockers ?? 'none')).join('\n') || '- No submitted reports in range.'
    const prompt = [
      'Write a **Team Management Summary** for leadership as a professional briefing.',
      'Required structure (use exactly these ## headings):',
      '## 1. Executive Summary — 3 sentences: team productivity, submission rate, headline blocker.',
      '## 2. Submission Overview — markdown table | Date | Submitted | Team Size | Rate | then one sentence interpreting the trend.',
      '## 3. Productivity Highlights — bullets: top contributors + average activity per person.',
      '## 4. Common Blockers — bullets grouped by theme with how many reports mentioned each.',
      '## 5. CRM Context — 2–3 bullets linking daily activity to pipeline/lead movement from the snapshot.',
      '## 6. Recommendations — exactly 3 numbered, leadership-ready actions (what, owner type, by when).',
      'Formatting: Use **bold** for every count/rate. Use tables where specified. Keep scannable; no paragraph >3 lines.',
      '',
      'Date range: ' + from.toISOString().slice(0, 10) + ' to ' + to.toISOString().slice(0, 10),
      'Team size (active): ' + total + ', submitted in range: ' + reports.length + ', submitted today: ' + submittedTodayCount,
      '',
      'Daily reports (sample):',
      reportLines,
    ].join('\n')
    const content = await generateCompletion([{ role: 'user', content: prompt }], systemPrompt(orgContext))
    const row = await prisma.aIReport.create({
      data: {
        type: 'team_management_summary',
        title: 'Team Management Summary — ' + from.toISOString().slice(0, 10) + ' to ' + to.toISOString().slice(0, 10),
        content,
        organizationId,
        generatedById: session.user.id,
      },
    })
    return ok({ id: row.id })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to generate summary'
    return err(msg)
  }
}

/**
 * Field-sales daily summary — summarizes today's field work for sales.
 * Pulls today's VisitReports (what was discussed) + today's DailyReport
 * + check-ins/visits, then asks the LLM to produce a daily sales briefing.
 * Linked from Field Sales → Visit Reports → "Generate AI sales summary".
 */
export async function generateFieldSalesDailySummary(opts?: { date?: Date }): Promise<Result<{ id: string }>> {
  const session = await requireApiSession()
  const organizationId = session.user.organizationId
  const day = opts?.date ?? new Date()
  const start = new Date(day)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  const dateLabel = start.toISOString().slice(0, 10)

  try {
    const [visitReports, dailyReport, checkIns, visitsToday, openDeals] = await Promise.all([
      prisma.visitReport.findMany({
        where: { createdById: session.user.id, createdAt: { gte: start, lt: end }, visit: { organizationId } },
        include: { visit: { select: { title: true, company: { select: { name: true } } } } },
        orderBy: { createdAt: 'asc' },
        take: 30,
      }),
      prisma.dailyReport.findFirst({
        where: { organizationId, userId: session.user.id, date: { gte: start, lt: end } },
      }),
      prisma.checkIn.findMany({
        where: { userId: session.user.id, createdAt: { gte: start, lt: end }, visit: { organizationId } },
        include: { visit: { select: { title: true } } },
        orderBy: { createdAt: 'asc' },
        take: 30,
      }),
      prisma.fieldVisit.count({ where: { organizationId, assigneeId: session.user.id, scheduledAt: { gte: start, lt: end } } }),
      prisma.deal.findMany({
        where: { organizationId, ownerId: session.user.id, stage: { notIn: ['WON', 'LOST'] } },
        orderBy: { value: 'desc' },
        take: 5,
        select: { name: true, stage: true, value: true },
      }),
    ])

    const orgContext = await buildOrgContext(organizationId, session.user)

    const visitReportLines =
      visitReports.length > 0
        ? visitReports
            .map(
              (r) =>
                `- Visit: ${r.visit.title}${r.visit.company?.name ? ` — ${r.visit.company.name}` : ''} | Purpose: ${r.purpose} | Discussion: ${(r.discussion ?? '-').slice(0, 500)} | Requirements: ${(r.requirements ?? '-').slice(0, 300)} | Next: ${(r.nextSteps ?? '-').slice(0, 300)}`
            )
            .join('\n')
        : '- No field visit reports filed today.'

    const checkInLines =
      checkIns.length > 0
        ? checkIns.map((c) => `- ${c.visit.title} at ${c.createdAt.toISOString().slice(11, 16)} — ${c.verificationStatus}${c.notes ? ` — ${c.notes.slice(0, 200)}` : ''}`).join('\n')
        : '- No check-ins today.'

    const dailyBlock = dailyReport
      ? [
          `DailyReport ${dateLabel} [${dailyReport.status}]:`,
          `workDescription: ${(dailyReport.workDescription ?? '-').slice(0, 1200)}`,
          `completedWork: ${(dailyReport.completedWork ?? '-').slice(0, 1000)}`,
          `pendingWork: ${(dailyReport.pendingWork ?? '-').slice(0, 800)}`,
          `blockers: ${(dailyReport.blockers ?? '-').slice(0, 600)}`,
          `tomorrowPlan: ${(dailyReport.tomorrowPlan ?? '-').slice(0, 600)}`,
        ].join('\n')
      : `No DailyReport submitted for ${dateLabel} — field reports will create a draft.`

    const prompt = [
      'Write a **Field Sales Daily Summary** — a concise, manager-ready briefing of today\'s field sales work.',
      'Required structure (use exactly these ## headings in order):',
      '## 1. TL;DR — 2 sentences: top win today and single biggest follow-up risk.',
      '## 2. Visits Today — markdown table | Visit | Company | Purpose | Key Discussion | Requirements | Next Step | (one row per field report; if none, write "No reports filed" and suggest filing).',
      '## 3. What Was Discussed — bullets per visit (customer need, objection, interest). Use the discussion text verbatim where possible.',
      '## 4. Customer Requirements & Feedback — grouped bullets (pricing, feature, volume, competitor mentions).',
      '## 5. Sales Actions for Tomorrow — numbered 1–5: the exact 5 follow-ups to do tomorrow (what, who/visit, by when). Derive from nextSteps.',
      '## 6. Daily Sales Pulse — markdown table | Metric | Today | Note | rows: Visits Scheduled, Field Reports Filed, Check-ins (Verified/Pending), Open Deals (top 5 by value) — use CRM snapshot numbers below.',
      'Formatting: Use **bold** for every count, company, and monetary value. Keep scannable; no paragraph >3 lines. Never invent visits or requirements not listed.',
      '',
      `Date: ${dateLabel}`,
      `Rep: ${session.user.name ?? session.user.email}`,
      `Visits scheduled today: ${visitsToday} | Visit reports filed: ${visitReports.length} | Check-ins today: ${checkIns.length}`,
      '',
      'Field visit reports (today, by this rep):',
      visitReportLines,
      '',
      'Check-ins today:',
      checkInLines,
      '',
      dailyBlock,
      '',
      'Top open deals (context):',
      openDeals.length ? openDeals.map((d) => `- ${d.name}: ${d.stage} worth ₹${Number(d.value).toLocaleString('en-IN')}`).join('\n') : '- none',
    ].join('\n')

    const content = await generateCompletion([{ role: 'user', content: prompt }], systemPrompt(orgContext))
    // field_sales_daily_summary is NOT linked via dailyReportId (that FK is @unique for employee_daily_summary) — keep it standalone.
    const row = await prisma.aIReport.create({
      data: {
        type: 'field_sales_daily_summary',
        title: `Field Sales Daily Summary — ${dateLabel} — ${session.user.name ?? session.user.email}`,
        content,
        organizationId,
        generatedById: session.user.id,
      },
    })
    return ok({ id: row.id })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to generate summary'
    return err(msg)
  }
}

/**
 * Deletion is narrower than viewing. Reading a non-employee report is
 * intentional org-wide sharing (see listReports/getReport), but deleting one
 * is destructive, so it is limited to:
 *   - the report's creator (generatedById), or
 *   - holders of 'reports.view_all', or
 *   - SUPER_ADMIN / ADMIN (record scope ALL).
 * The previous check only tested *view* access, which let any org member who
 * could see a report delete it too.
 */
function canDeleteReport(user: Session['user'], generatedById: string): boolean {
  if (generatedById === user.id) return true
  if ((user.permissions as string[]).includes('reports.view_all')) return true
  return getRecordScope(user) === 'ALL'
}

export async function deleteReport(id: string): Promise<Result<void>> {
  try {
    const session = await requireApiSession()
    const existing = await prisma.aIReport.findFirst({
      where: { id, organizationId: session.user.organizationId },
      select: { id: true, type: true, generatedById: true, dailyReport: { select: { userId: true } } },
    })
    // Report-not-found and not-allowed are deliberately indistinguishable so
    // the endpoint can't be used to probe for report ids in the org.
    if (!existing) return err('Report not found')
    if (existing.type === 'employee_daily_summary' && !canViewEmployeeSummary(session.user, existing.dailyReport?.userId)) {
      return err('Report not found')
    }
    if (!canDeleteReport(session.user, existing.generatedById)) {
      return err('Report not found')
    }
    await prisma.aIReport.delete({ where: { id } })
    return ok(undefined)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to delete report'
    return err(msg)
  }
}

export { isAIConfigured }

// ============================================================
// Ad-hoc data analysis — a single grounded Q&A over the live CRM
// snapshot, for /ai/data-analysis. Unlike AI Chat this isn't a saved,
// multi-turn conversation; unlike AI Reports it isn't persisted — it's a
// quick "ask a question about the data" tool.
// ============================================================

export async function analyzeQuestion(
  question: string,
  opts?: { docContext?: string; images?: import('@/lib/ai').AIImageAttachment[] }
): Promise<string> {
  const session = await requireApiSession()
  const orgContext = await buildOrgContext(session.user.organizationId, session.user)
  const hasDocs = !!opts?.docContext?.trim()
  const system = [
    'You are a data analyst embedded in Kawman ExAct, a CRM and field-sales platform.',
    hasDocs
      ? 'Answer using BOTH the live CRM snapshot AND the uploaded document context (PDF/image/sheet extract that follows). Ground numbers in whichever source you cite, quote exact figures, and never invent data. Use short markdown (headings, bullets, bold numbers, tables).'
      : 'Answer the question below using ONLY the live CRM snapshot provided. Be specific and quote the actual numbers from the snapshot. If the snapshot doesn\'t contain enough detail to fully answer, say so plainly rather than guessing. Use short markdown (headings, bullets, bold numbers).',
    '',
    orgContext,
  ].join('\n')

  return generateCompletion([{ role: 'user', content: question }], system, {
    docContext: opts?.docContext,
    images: opts?.images,
  })
}
