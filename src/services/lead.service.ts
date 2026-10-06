import 'server-only'
import { prisma } from '@/lib/db'
import { requireApiSession } from '@/lib/session'
import type { Lead, LeadStatus } from '@/types/crm'
import type { Session } from '@/lib/auth'
import type { Prisma } from '@/generated/prisma'
import { ownerScopeWhere } from '@/lib/record-scope-helpers'
import { toInitials } from '@/lib/utils'

/**
 * Adds the visibility scope on top of the organizationId filter every
 * query already has. Without this, any role with the base "leads.view"
 * permission (SALES_EXECUTIVE, MARKETING, VIEWER, ...) would see every
 * lead in the org — the base permission only gates page/action access,
 * not which rows come back. See lib/record-scope.ts.
 */
function scopeWhere(user: Session['user']): Prisma.LeadWhereInput {
  return ownerScopeWhere<Prisma.LeadWhereInput>(user)
}

type LeadWithOwner = Awaited<ReturnType<typeof fetchLeads>>[number]

async function fetchLeads(organizationId: string, scopeFilter: Prisma.LeadWhereInput) {
  return prisma.lead.findMany({
    where: { organizationId, ...scopeFilter },
    include: { owner: { select: { name: true } }, companyRef: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  })
}

function mapLead(row: LeadWithOwner): Lead {
  return {
    id: row.id,
    name: row.name,
    company: row.companyRef?.name ?? row.company ?? '—',
    email: row.email ?? '',
    phone: row.phone ?? '',
    source: row.source ?? 'Other',
    owner: row.owner.name ?? 'Unassigned',
    ownerInitials: toInitials(row.owner.name ?? 'U'),
    ownerId: row.ownerId,
    status: row.status as LeadStatus,
    segment: row.segment ?? null,
    createdAt: row.createdAt.toISOString(),
    lastActivityAt: (row.lastActivityAt ?? row.createdAt).toISOString(),
    notes: row.notes ?? null,
    contactPerson: row.contactPerson ?? null,
    designation: row.designation ?? null,
    meetingDate: row.meetingDate ? row.meetingDate.toISOString() : null,
    meetingAt: row.meetingAt ?? null,
    productsDiscussed: row.productsDiscussed ?? [],
    customProductNames: row.customProductNames ?? [],
    keyDiscussion: row.keyDiscussionPoints ?? null,
    requirement: row.customerRequirement ?? null,
    grade: row.grade ?? null,
    cdaStatus: row.cdaStatus ?? null,
    samplingStatus: row.samplingStatus ?? null,
    rdFeedback: row.rndFeedback ?? null,
    remark: row.remark ?? null,
    nextFollowUp: row.nextFollowUp ? row.nextFollowUp.toISOString() : null,
    loaStatus: row.loaStatus ?? null,
    location: row.location ?? null,
    region: row.region ?? null,
    purposeOfVisit: row.purposeOfVisit ?? null,
  }
}

/** Scoped strictly to the current session's organization — never trust a caller-supplied org id. */
export async function getLeads(): Promise<Lead[]> {
  const session = await requireApiSession()
  const rows = await fetchLeads(session.user.organizationId, scopeWhere(session.user))
  return rows.map(mapLead)
}

export type LeadSortKey = 'name' | 'lastActivityAt' | 'createdAt'

export interface LeadQuery {
  /** Free-text search against name / company / email. */
  search?: string
  status?: LeadStatus
  sortKey?: LeadSortKey
  sortDir?: 'asc' | 'desc'
  /** 1-indexed page number. */
  page?: number
  pageSize?: number
}

export interface LeadPage {
  leads: Lead[]
  total: number
  page: number
  pageSize: number
  pageCount: number
}

const SORT_FIELD: Record<LeadSortKey, string> = {
  name: 'name',
  lastActivityAt: 'lastActivityAt',
  createdAt: 'createdAt',
}

/**
 * Server-side paginated + searched + sorted lead listing. Replaces the old
 * client-side-filter pattern (fetch everything, filter/sort in the
 * browser) which doesn't scale past a few hundred rows — see audit
 * "Code Quality" section. All filtering happens in the DB query.
 */
export async function getLeadsPage(query: LeadQuery = {}): Promise<LeadPage> {
  const session = await requireApiSession()
  const page = Math.max(1, query.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 25))
  const sortKey = query.sortKey ?? 'lastActivityAt'
  const sortDir = query.sortDir ?? 'desc'
  const search = query.search?.trim()

  const where: Prisma.LeadWhereInput = {
    organizationId: session.user.organizationId,
    ...scopeWhere(session.user),
    ...(query.status ? { status: query.status } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { company: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
            { companyRef: { name: { contains: search, mode: 'insensitive' as const } } },
            { contactPerson: { contains: search, mode: 'insensitive' as const } },
            { productsDiscussed: { has: search } },
          ],
        }
      : {}),
  }

  const [total, rows] = await Promise.all([
    prisma.lead.count({ where }),
    prisma.lead.findMany({
      where,
      include: { owner: { select: { name: true } }, companyRef: { select: { name: true } } },
      orderBy: { [SORT_FIELD[sortKey]]: sortDir },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])

  return {
    leads: rows.map(mapLead),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  }
}

export async function getLeadById(id: string): Promise<Lead | null> {
  const session = await requireApiSession()
  const row = await prisma.lead.findFirst({
    where: { id, organizationId: session.user.organizationId, ...scopeWhere(session.user) },
    include: { owner: { select: { name: true } }, companyRef: { select: { name: true } } },
  })
  return row ? mapLead(row) : null
}