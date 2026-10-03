import 'server-only'
import { prisma } from '@/lib/db'
import { requireApiSession } from '@/lib/session'

export type CalendarEventType = 'meeting' | 'visit' | 'followup'

export interface CalendarEvent {
  type: CalendarEventType
  id: string
  title: string
  /** ISO date-time. */
  at: string
  subtitle: string
  href: string
  isOverdue?: boolean
}

/**
 * Unified calendar (audit: "Calendar View — meetings/visits only in
 * table/list"). Pulls from three existing entities that already carry a
 * date — Meeting.scheduledAt, FieldVisit.scheduledAt, FollowUp.dueDate —
 * rather than introducing a new "event" concept the rest of the app
 * doesn't have.
 */
export async function getCalendarEvents(year: number, month: number): Promise<CalendarEvent[]> {
  const session = await requireApiSession()
  const organizationId = session.user.organizationId

  // Widen by a few days on either side so events near month boundaries
  // still show on the calendar week rows that spill into adjacent months.
  const rangeStart = new Date(year, month - 1, 1)
  rangeStart.setDate(rangeStart.getDate() - 7)
  const rangeEnd = new Date(year, month, 1)
  rangeEnd.setDate(rangeEnd.getDate() + 7)

  const [meetings, visits, followUps] = await Promise.all([
    prisma.meeting.findMany({
      where: { organizationId, scheduledAt: { gte: rangeStart, lt: rangeEnd } },
      select: { id: true, title: true, scheduledAt: true, type: true, company: { select: { name: true } } },
    }),
    prisma.fieldVisit.findMany({
      where: { organizationId, scheduledAt: { gte: rangeStart, lt: rangeEnd } },
      select: { id: true, title: true, scheduledAt: true, company: { select: { name: true } } },
    }),
    prisma.followUp.findMany({
      where: { organizationId, dueDate: { gte: rangeStart, lt: rangeEnd } },
      select: { id: true, title: true, dueDate: true, status: true },
    }),
  ])

  const now = new Date()

  const events: CalendarEvent[] = [
    ...meetings.map((m) => ({
      type: 'meeting' as const,
      id: m.id,
      title: m.title,
      at: m.scheduledAt?.toISOString() ?? new Date().toISOString(),
      subtitle: m.company?.name ?? m.type.replace('_', ' '),
      href: `/meetings/${m.id}`,
    })),
    ...visits.map((v) => ({
      type: 'visit' as const,
      id: v.id,
      title: v.title,
      at: v.scheduledAt.toISOString(),
      subtitle: v.company?.name ?? 'Field visit',
      href: '/field-sales',
    })),
    ...followUps.map((f) => ({
      type: 'followup' as const,
      id: f.id,
      title: f.title,
      at: f.dueDate.toISOString(),
      subtitle: 'Follow-up',
      href: '/follow-ups',
      isOverdue: f.status === 'PENDING' && f.dueDate < now,
    })),
  ]

  return events.sort((a, b) => a.at.localeCompare(b.at))
}
