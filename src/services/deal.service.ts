import 'server-only'
import { prisma } from '@/lib/db'
import { requireApiSession } from '@/lib/session'
import type { Deal, DealStage } from '@/types/crm'
import type { Session } from '@/lib/auth'
import type { Prisma } from '@/generated/prisma'
import { ownerScopeWhere } from '@/lib/record-scope-helpers'
import { toInitials } from '@/lib/utils'

/** See lib/record-scope.ts — the base "deals.view" permission only
 * gates page access, not which rows come back. This adds that filter. */
function scopeWhere(user: Session['user']): Prisma.DealWhereInput {
  return ownerScopeWhere<Prisma.DealWhereInput>(user)
}

type DealRow = Awaited<ReturnType<typeof fetchDeals>>[number]

const DEALS_KANBAN_LIMIT = 500

async function fetchDeals(organizationId: string, scopeFilter: Prisma.DealWhereInput, search?: string, limit = DEALS_KANBAN_LIMIT) {
  return prisma.deal.findMany({
    where: {
      organizationId,
      ...scopeFilter,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { company: { name: { contains: search, mode: 'insensitive' as const } } },
              { contact: { name: { contains: search, mode: 'insensitive' as const } } },
            ],
          }
        : {}),
    },
    include: {
      owner: { select: { name: true } },
      company: { select: { name: true } },
      contact: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })
}

function mapDeal(row: DealRow): Deal {
  return {
    id: row.id,
    name: row.name,
    company: row.company?.name ?? '—',
    contact: row.contact?.name ?? '—',
    value: Number(row.value),
    probability: row.probability,
    stage: row.stage as DealStage,
    owner: row.owner.name ?? 'Unassigned',
    ownerInitials: toInitials(row.owner.name ?? 'U'),
    expectedClose: row.expectedClose ? row.expectedClose.toISOString().slice(0, 10) : '',
    priority: (row.priority as Deal['priority']) ?? 'MEDIUM',
    segment: row.segment ?? null,
  }
}

/**
 * `search` is optional and defaults to no filter — the export route
 * calls this with zero args and keeps exporting the full set, matching
 * how every other entity's export route behaves (exports the complete
 * dataset, not just what's currently filtered on screen).
 *
 * No pagination here, unlike getLeadsPage/getCompaniesPage/etc: this
 * backs the Kanban board, where the whole point is seeing the full
 * pipeline grouped by stage at a glance — paging through the board
 * would break that. Search still moves to the DB query rather than
 * filtering client-side, so a search narrows what's fetched at all.
 */
export async function getDeals(search?: string): Promise<Deal[]> {
  const session = await requireApiSession()
  const rows = await fetchDeals(session.user.organizationId, scopeWhere(session.user), search)
  return rows.map(mapDeal)
}

export interface DealDetail extends Deal {
  ownerId: string
  companyId: string | null
  contactId: string
  notes: string
  contactEmail: string | null
  contactMobile: string | null
}

/** Full record for the deal detail page, org- and scope-restricted. Returns null if not found, not in this org, or outside the caller's visibility scope. */
export async function getDealById(id: string): Promise<DealDetail | null> {
  const session = await requireApiSession()
  const row = await prisma.deal.findFirst({
    where: { id, organizationId: session.user.organizationId, ...scopeWhere(session.user) },
    include: {
      owner: { select: { name: true } },
      company: { select: { name: true } },
      contact: { select: { name: true, email: true, mobile: true } },
    },
  })
  if (!row) return null
  return {
    ...mapDeal(row),
    ownerId: row.ownerId,
    companyId: row.companyId,
    contactId: row.contactId ?? '',
    notes: row.notes ?? '',
    contactEmail: row.contact?.email ?? null,
    contactMobile: row.contact?.mobile ?? null,
  }
}