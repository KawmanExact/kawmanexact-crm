import 'server-only'
import { prisma } from '@/lib/db'
import { requireApiSession } from '@/lib/session'
import type { Deal, DealStage } from '@/types/crm'
import type { Session } from '@/lib/auth'
import type { Prisma } from '@/generated/prisma'
import { ownerScopeWhere } from '@/lib/record-scope-helpers'
import { productOptionLabel } from '@/types/sales'
import { toMoney } from '@/lib/sales-money'
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
              { contactPerson: { contains: search, mode: 'insensitive' as const } },
              { email: { contains: search, mode: 'insensitive' as const } },
              { productsDiscussed: { has: search } },
              { city: { contains: search, mode: 'insensitive' as const } },
              { country: { contains: search, mode: 'insensitive' as const } },
              { pinCode: { contains: search, mode: 'insensitive' as const } },
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
    contact: row.contact?.name ?? row.contactPerson ?? '—',
    value: Number(row.value),
    probability: row.probability,
    stage: row.stage as DealStage,
    owner: row.owner.name ?? 'Unassigned',
    ownerInitials: toInitials(row.owner.name ?? 'U'),
    expectedClose: row.expectedClose ? row.expectedClose.toISOString().slice(0, 10) : '',
    priority: (row.priority as Deal['priority']) ?? 'MEDIUM',
    paymentStatus: row.paymentStatus ?? null,
    // Capture fields — a deal is the lead, so the board card can show the
    // enquiry detail without a second lookup.
    email: row.email ?? '',
    phone: row.phone ?? '',
    source: row.source ?? '—',
    contactPerson: row.contactPerson ?? null,
    designation: row.designation ?? null,
    city: row.city ?? null,
    country: row.country ?? null,
    pinCode: row.pinCode ?? null,
    cdaStatus: row.cdaStatus ?? null,
    samplingStatus: row.samplingStatus ?? null,
    grade: row.grade ?? null,
    application: row.application ?? null,
    applicationOther: row.applicationOther ?? null,
    loaStatus: row.loaStatus ?? null,
    nextFollowUp: row.nextFollowUp ? row.nextFollowUp.toISOString().slice(0, 10) : null,
    purposeOfVisit: row.purposeOfVisit ?? null,
    keyDiscussion: row.keyDiscussionPoints ?? null,
    requirement: row.customerRequirement ?? null,
    meetingAt: row.meetingAt ?? null,
    meetingDate: row.meetingDate ? row.meetingDate.toISOString().slice(0, 10) : null,
    meetingMode: row.meetingMode ?? null,
    rdFeedback: row.rndFeedback ?? null,
    remark: row.remark ?? null,
    productsDiscussed: row.productsDiscussed ?? [],
    customProductNames: row.customProductNames ?? [],
    createdAt: row.createdAt.toISOString(),
    lastActivityAt: row.lastActivityAt ? row.lastActivityAt.toISOString().slice(0, 10) : '',
  }
}

/**
 * `search` is optional and defaults to no filter — the export route
 * calls this with zero args and keeps exporting the full set, matching
 * how every other entity's export route behaves (exports the complete
 * dataset, not just what's currently filtered on screen).
 *
 * No pagination here, unlike getDealsPage/getCompaniesPage/etc: this
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

export type DealSortKey = 'name' | 'value' | 'lastActivityAt' | 'createdAt'

export interface DealQuery {
  search?: string
  stage?: string
  sortKey?: DealSortKey
  sortDir?: 'asc' | 'desc'
  /** 1-indexed page number. */
  page?: number
  pageSize?: number
}

export interface DealPage {
  deals: Deal[]
  total: number
  page: number
  pageSize: number
  pageCount: number
}

const SORT_FIELD: Record<DealSortKey, string> = {
  name: 'name',
  value: 'value',
  lastActivityAt: 'lastActivityAt',
  createdAt: 'createdAt',
}

/**
 * Server-side paginated / searched / sorted listing, mirroring
 * getDealsPage — filtering happens in the query rather than in the browser so
 * the list stays usable past a few hundred deals.
 */
export async function getDealsPage(query: DealQuery = {}): Promise<DealPage> {
  const session = await requireApiSession()
  const page = Math.max(1, query.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 25))
  const sortKey = query.sortKey ?? 'lastActivityAt'
  const sortDir = query.sortDir ?? 'desc'
  const search = query.search?.trim()

  const where: Prisma.DealWhereInput = {
    organizationId: session.user.organizationId,
    ...scopeWhere(session.user),
    ...(query.stage ? { stage: query.stage as DealStage } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
            { contactPerson: { contains: search, mode: 'insensitive' as const } },
            { company: { name: { contains: search, mode: 'insensitive' as const } } },
            { productsDiscussed: { has: search } },
            { city: { contains: search, mode: 'insensitive' as const } },
            { country: { contains: search, mode: 'insensitive' as const } },
            { pinCode: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  }

  const [total, rows] = await Promise.all([
    prisma.deal.count({ where }),
    prisma.deal.findMany({
      where,
      include: {
        owner: { select: { name: true } },
        company: { select: { name: true } },
        contact: { select: { name: true } },
      },
      orderBy: [{ [SORT_FIELD[sortKey]]: sortDir }, { createdAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])

  return {
    deals: rows.map(mapDeal),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  }
}

export async function getDealsForExport(filters: { stage?: string; search?: string } = {}): Promise<Prisma.DealGetPayload<{ include: { owner: { select: { name: true } }; company: { select: { name: true } }; contact: { select: { name: true; phone: true } } } }>[]> {
  const session = await requireApiSession()
  const where: Prisma.DealWhereInput = {
    organizationId: session.user.organizationId,
    ...scopeWhere(session.user),
    ...(filters.stage ? { stage: filters.stage as any } : {}),
    ...(filters.search
      ? {
          OR: [
            { name: { contains: filters.search, mode: 'insensitive' as const } },
            { company: { name: { contains: filters.search, mode: 'insensitive' as const } } },
            { contact: { name: { contains: filters.search, mode: 'insensitive' as const } } },
            { contactPerson: { contains: filters.search, mode: 'insensitive' as const } },
            { email: { contains: filters.search, mode: 'insensitive' as const } },
            { productsDiscussed: { has: filters.search } },
            { city: { contains: filters.search, mode: 'insensitive' as const } },
            { country: { contains: filters.search, mode: 'insensitive' as const } },
            { pinCode: { contains: filters.search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  }

  const rows = await prisma.deal.findMany({
    where,
    include: {
      owner: { select: { name: true } },
      company: { select: { name: true } },
      contact: { select: { name: true, phone: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return rows
}

export interface DealItemDetail {
  id: string
  productId: string | null
  productName: string | null
  quantity: number
  unitPrice: number
  unitCost: number
  unit: string | null
  defaultUnitPrice: number | null
}

export interface DealDetail extends Deal {
  ownerId: string
  companyId: string | null
  contactId: string
  notes: string
  contactEmail: string | null
  contactMobile: string | null
  items: DealItemDetail[]
  lostReason: string | null
  meetingDate: string | null
  meetingAt: string | null
  meetingMode: string | null
  purposeOfVisit: string | null
  keyDiscussion: string | null
  requirement: string | null
  grade: string | null
  application: string | null
  applicationOther: string | null
  rdFeedback: string | null
  remark: string | null
  loaStatus: string | null
  score: number
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
      items: {
        orderBy: { createdAt: 'asc' },
        include: {
          product: {
            select: {
              id: true,
              name: true,
              variant: true,
              unit: true,
              defaultUnitPrice: true,
              unitPrice: true,
              unitCost: true,
              isActive: true,
            },
          },
        },
      },
    },
  })
  if (!row) return null
  return {
    ...mapDeal(row),
    ownerId: row.ownerId,
    companyId: row.companyId,
    contactId: row.contactId ?? '',
    notes: row.notes ?? '',
    contactEmail: row.contact?.email ?? row.email ?? null,
    contactMobile: row.contact?.mobile ?? row.phone ?? null,
    items: row.items?.map((it) => ({
        id: it.id,
        productId: it.productId,
        productName: it.product ? productOptionLabel({ name: it.product.name, variant: it.product.variant }) : null,
        quantity: Number(it.quantity),
        unitPrice: toMoney(it.unitPrice).toNumber(),
        unitCost: it.unitCost !== null && it.unitCost !== undefined ? toMoney(it.unitCost).toNumber() : 0,
        unit: it.product?.unit ?? null,
        defaultUnitPrice: it.product?.defaultUnitPrice
          ? toMoney(it.product.defaultUnitPrice).toNumber()
          : it.product?.unitPrice
            ? toMoney(it.product.unitPrice).toNumber()
            : null,
      })) ?? [],
    lostReason: row.lostReason ?? null,
    meetingDate: row.meetingDate ? row.meetingDate.toISOString().slice(0, 10) : null,
    meetingAt: row.meetingAt ?? null,
    meetingMode: row.meetingMode ?? null,
    purposeOfVisit: row.purposeOfVisit ?? null,
    keyDiscussion: row.keyDiscussionPoints ?? null,
    requirement: row.customerRequirement ?? null,
    grade: row.grade ?? null,
    rdFeedback: row.rndFeedback ?? null,
    remark: row.remark ?? null,
    nextFollowUp: row.nextFollowUp ? row.nextFollowUp.toISOString().slice(0, 10) : null,
    loaStatus: row.loaStatus ?? null,
    score: row.score ?? 0,
  }
}