import 'server-only'
import { prisma } from '@/lib/db'
import { requireApiSession } from '@/lib/session'
import type { Company } from '@/types/crm'
import type { Session } from '@/lib/auth'
import type { Prisma } from '@/generated/prisma'
import { ownerScopeWhere } from '@/lib/record-scope-helpers'
import { toInitials } from '@/lib/utils'

/** See lib/record-scope.ts — the base "companies.view" permission only
 * gates page access, not which rows come back. This adds that filter. */
function scopeWhere(user: Session['user']): Prisma.CompanyWhereInput {
  return ownerScopeWhere<Prisma.CompanyWhereInput>(user)
}

type CompanyRow = Awaited<ReturnType<typeof fetchCompanies>>[number]

async function fetchCompanies(organizationId: string, scopeFilter: Prisma.CompanyWhereInput) {
  return prisma.company.findMany({
    where: { organizationId, ...scopeFilter },
    include: { owner: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  })
}

function mapCompany(row: CompanyRow): Company {
  return {
    id: row.id,
    name: row.name,
    industry: row.industry ?? '—',
    website: row.website ?? '',
    phone: row.phone ?? '',
    email: row.email ?? '',
    city: row.city ?? '',
    state: row.state ?? '',
    employees: row.employees ?? 0,
    revenue: row.revenue ? Number(row.revenue) : 0,
    owner: row.owner.name ?? 'Unassigned',
    ownerInitials: toInitials(row.owner.name ?? 'U'),
    status: row.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
    createdAt: row.createdAt.toISOString(),
  }
}

export async function getCompanies(): Promise<Company[]> {
  const session = await requireApiSession()
  const rows = await fetchCompanies(session.user.organizationId, scopeWhere(session.user))
  return rows.map(mapCompany)
}

export type CompanySortKey = 'name' | 'employees' | 'revenue' | 'createdAt'

export interface CompanyQuery {
  search?: string
  status?: 'ACTIVE' | 'INACTIVE'
  sortKey?: CompanySortKey
  sortDir?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}

export interface CompanyPage {
  companies: Company[]
  total: number
  page: number
  pageSize: number
  pageCount: number
}

const COMPANY_SORT_FIELD: Record<CompanySortKey, string> = {
  name: 'name',
  employees: 'employees',
  revenue: 'revenue',
  createdAt: 'createdAt',
}

/**
 * Server-side paginated + searched + sorted company listing — replaces
 * the fetch-everything-then-filter-in-the-browser pattern in
 * companies-table.tsx, which doesn't scale past a few hundred rows.
 * Mirrors services/lead.service.ts#getLeadsPage exactly.
 */
export async function getCompaniesPage(query: CompanyQuery = {}): Promise<CompanyPage> {
  const session = await requireApiSession()
  const page = Math.max(1, query.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 25))
  const sortKey = query.sortKey ?? 'createdAt'
  const sortDir = query.sortDir ?? 'desc'
  const search = query.search?.trim()

  const where: Prisma.CompanyWhereInput = {
    organizationId: session.user.organizationId,
    ...scopeWhere(session.user),
    ...(query.status ? { status: query.status } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { city: { contains: search, mode: 'insensitive' as const } },
            { industry: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  }

  const [total, rows] = await Promise.all([
    prisma.company.count({ where }),
    prisma.company.findMany({
      where,
      include: { owner: { select: { name: true } } },
      orderBy: { [COMPANY_SORT_FIELD[sortKey]]: sortDir },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])

  return {
    companies: rows.map(mapCompany),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  }
}

/** Lightweight list for form <select> pickers (create lead/contact/deal). Scoped to caller's visibility. */
export async function getCompanyOptions(): Promise<{ id: string; name: string }[]> {
  const session = await requireApiSession()
  return prisma.company.findMany({
    where: { organizationId: session.user.organizationId, ...scopeWhere(session.user) },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  })
}

export interface CompanyDetail extends Company {
  ownerId: string
}

/** Full record for the company detail page, org- and scope-restricted. Returns null if not found, not in this org, or outside the caller's visibility scope. */
export async function getCompanyById(id: string): Promise<CompanyDetail | null> {
  const session = await requireApiSession()
  const row = await prisma.company.findFirst({
    where: { id, organizationId: session.user.organizationId, ...scopeWhere(session.user) },
    include: { owner: { select: { name: true } } },
  })
  if (!row) return null
  return { ...mapCompany(row), ownerId: row.ownerId }
}

/**
 * Find an existing Company by name (case-insensitive, scoped to organizationId)
 * or create it. Extracted from the inline logic in leads/actions.ts
 * (convertLeadToDeal + CSV import) so contacts/deals can share the same path.
 * Returns null when name is empty/whitespace. Requires ownerId for creation
 * because Company.ownerId is NOT NULL — callers pass session.user.id or the
 * record's ownerId. Case-insensitive via `mode: 'insensitive'` on Postgres.
 */
export async function findOrCreateCompanyByName(input: {
  name: string
  organizationId: string
  ownerId: string
  website?: string | null
  address?: string | null
}): Promise<{ id: string; name: string } | null> {
  const trimmed = input.name?.trim()
  if (!trimmed) return null
  const existing = await prisma.company.findFirst({
    where: { organizationId: input.organizationId, name: { equals: trimmed, mode: 'insensitive' as const } },
    select: { id: true, name: true },
  })
  if (existing) return existing
  const created = await prisma.company.create({
    data: {
      name: trimmed,
      organizationId: input.organizationId,
      ownerId: input.ownerId,
      website: input.website || undefined,
      address: input.address || undefined,
    },
    select: { id: true, name: true },
  })
  return created
}

// Alias matching the spec's suggested name — both are exported.
export const findOrCreateCompany = findOrCreateCompanyByName