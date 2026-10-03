import 'server-only'
import { prisma } from '@/lib/db'
import { requireApiSession } from '@/lib/session'

export type FollowUpStatus = 'PENDING' | 'COMPLETED' | 'OVERDUE' | 'CANCELLED'

export interface FollowUpRow {
  id: string
  title: string
  description: string
  dueDate: string
  priority: string
  status: FollowUpStatus
  ownerId: string
  ownerName: string
  ownerInitials: string
  linkedTo: { type: 'lead' | 'company' | 'deal'; id: string; label: string } | null
  isOverdue: boolean
}

export interface FollowUpFilters {
  /** 'mine' scopes to the current user; 'all' shows the whole org (still org-scoped). */
  scope?: 'mine' | 'all'
  status?: FollowUpStatus
}

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
}

export async function getFollowUps(filters: FollowUpFilters = {}): Promise<FollowUpRow[]> {
  const session = await requireApiSession()
  const now = new Date()

  const rows = await prisma.followUp.findMany({
    where: {
      organizationId: session.user.organizationId,
      ...(filters.scope === 'mine' ? { ownerId: session.user.id } : {}),
      ...(filters.status ? { status: filters.status } : {}),
    },
    orderBy: [{ status: 'asc' }, { dueDate: 'asc' }],
    take: 200,
    include: {
      owner: { select: { name: true } },
      lead: { select: { id: true, name: true } },
      company: { select: { id: true, name: true } },
      deal: { select: { id: true, name: true } },
    },
  })

  return rows.map((f) => {
    const linkedTo = f.lead
      ? ({ type: 'lead', id: f.lead.id, label: f.lead.name } as const)
      : f.company
        ? ({ type: 'company', id: f.company.id, label: f.company.name } as const)
        : f.deal
          ? ({ type: 'deal', id: f.deal.id, label: f.deal.name } as const)
          : null

    return {
      id: f.id,
      title: f.title,
      description: f.description ?? '',
      dueDate: f.dueDate.toISOString(),
      priority: f.priority,
      status: f.status,
      ownerId: f.ownerId,
      ownerName: f.owner.name ?? 'Unassigned',
      ownerInitials: initials(f.owner.name ?? 'U'),
      linkedTo,
      isOverdue: f.status === 'PENDING' && f.dueDate < now,
    }
  })
}

export interface LinkOption {
  id: string
  label: string
}

/** Options for the "link to" dropdowns on the create-follow-up form. */
export async function getFollowUpLinkOptions(): Promise<{
  leads: LinkOption[]
  companies: LinkOption[]
  deals: LinkOption[]
}> {
  const session = await requireApiSession()
  const organizationId = session.user.organizationId

  const [leads, companies, deals] = await Promise.all([
    prisma.lead.findMany({
      where: { organizationId, status: { notIn: ['WON', 'LOST'] } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
      take: 200,
    }),
    prisma.company.findMany({ where: { organizationId }, select: { id: true, name: true }, orderBy: { name: 'asc' }, take: 200 }),
    prisma.deal.findMany({
      where: { organizationId, stage: { notIn: ['WON', 'LOST'] } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
      take: 200,
    }),
  ])

  return {
    leads: leads.map((l) => ({ id: l.id, label: l.name })),
    companies: companies.map((c) => ({ id: c.id, label: c.name })),
    deals: deals.map((d) => ({ id: d.id, label: d.name })),
  }
}
