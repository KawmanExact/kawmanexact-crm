import 'server-only'
import { prisma } from '@/lib/db'
import { requireApiSession } from '@/lib/session'
import type { Contact } from '@/types/crm'
import type { Session } from '@/lib/auth'
import type { Prisma } from '@/generated/prisma'
import { contactOwnerScopeWhere } from '@/lib/record-scope-helpers'
import { toInitials } from '@/lib/utils'
import { buildContactEmailKey } from '@/lib/contact-dedupe'

/** See lib/record-scope.ts — the base "contacts.view" permission only
 * gates page access, not which rows come back. This adds that filter.
 * Contacts are owner-scoped: only SUPER_ADMIN/ADMIN see all contacts;
 * every other role sees only their own. */
function scopeWhere(user: Session['user']): Prisma.ContactWhereInput {
  return contactOwnerScopeWhere<Prisma.ContactWhereInput>(user)
}

type ContactRow = Awaited<ReturnType<typeof fetchContacts>>[number]

async function fetchContacts(organizationId: string, scopeFilter: Prisma.ContactWhereInput) {
  return prisma.contact.findMany({
    where: { organizationId, ...scopeFilter },
    include: { owner: { select: { name: true } }, company: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  })
}

function mapContact(row: ContactRow): Contact {
  return {
    id: row.id,
    name: row.name,
    company: row.company?.name ?? '—',
    designation: row.designation ?? '—',
    email: row.email ?? '',
    phone: row.phone ?? '',
    mobile: row.mobile ?? '',
    address: row.address ?? '',
    owner: row.owner.name ?? 'Unassigned',
    ownerInitials: toInitials(row.owner.name ?? 'U'),
    status: row.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
    segment: row.segment ?? null,
    lastActivityAt: (row.lastActivityAt ?? row.createdAt).toISOString(),
  }
}

export async function getContacts(): Promise<Contact[]> {
  const session = await requireApiSession()
  const rows = await fetchContacts(session.user.organizationId, scopeWhere(session.user))
  return rows.map(mapContact)
}

export type ContactSortKey = 'name' | 'lastActivityAt' | 'createdAt'

export interface ContactQuery {
  search?: string
  status?: 'ACTIVE' | 'INACTIVE'
  sortKey?: ContactSortKey
  sortDir?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}

export interface ContactPage {
  contacts: Contact[]
  total: number
  page: number
  pageSize: number
  pageCount: number
}

const CONTACT_SORT_FIELD: Record<ContactSortKey, string> = {
  name: 'name',
  lastActivityAt: 'lastActivityAt',
  createdAt: 'createdAt',
}

/**
 * Server-side paginated + searched + sorted contact listing — mirrors
 * services/lead.service.ts#getLeadsPage. Replaces the client-side-filter
 * pattern in contacts-table.tsx.
 */
export async function getContactsPage(query: ContactQuery = {}): Promise<ContactPage> {
  const session = await requireApiSession()
  const page = Math.max(1, query.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 25))
  const sortKey = query.sortKey ?? 'createdAt'
  const sortDir = query.sortDir ?? 'desc'
  const search = query.search?.trim()

  const where: Prisma.ContactWhereInput = {
    organizationId: session.user.organizationId,
    ...scopeWhere(session.user),
    ...(query.status ? { status: query.status } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
            { company: { name: { contains: search, mode: 'insensitive' as const } } },
          ],
        }
      : {}),
  }

  const [total, rows] = await Promise.all([
    prisma.contact.count({ where }),
    prisma.contact.findMany({
      where,
    include: { owner: { select: { name: true } }, company: { select: { name: true } } },
    orderBy: { [CONTACT_SORT_FIELD[sortKey]]: sortDir },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])

  return {
    contacts: rows.map(mapContact),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  }
}

/** Lightweight list for form <select> pickers (create deal/meeting). Scoped to caller's visibility. */
export async function getContactOptions(): Promise<{ id: string; name: string; companyId: string | null }[]> {
  const session = await requireApiSession()
  return prisma.contact.findMany({
    where: { organizationId: session.user.organizationId, ...scopeWhere(session.user) },
    select: { id: true, name: true, companyId: true },
    orderBy: { name: 'asc' },
  })
}

export interface ContactDetail extends Contact {
  ownerId: string
  companyId: string | null
  mobile: string
  address: string
}

/** Full record for the contact detail page, org- and scope-restricted. Returns null if not found, not in this org, or outside the caller's visibility scope. */
export async function getContactById(id: string): Promise<ContactDetail | null> {
  const session = await requireApiSession()
  const row = await prisma.contact.findFirst({
    where: { id, organizationId: session.user.organizationId, ...scopeWhere(session.user) },
    include: { owner: { select: { name: true } }, company: { select: { name: true } } },
  })
  if (!row) return null
  return { ...mapContact(row), ownerId: row.ownerId, companyId: row.companyId, mobile: row.mobile ?? '', address: row.address ?? '' }
}

/**
 * Matches strings that look like phone numbers: must start with + or a digit
 * and contain at least 6 digits (spaces/dashes allowed). Used as a
 * server-side safeguard so phone numbers can never silently become a
 * Contact's display `name`.
 */
export const PHONE_NUMBER_PATTERN = /^[+\d][\d\s()-]{6,}\d$/

export function looksLikePhoneNumber(value: string): boolean {
  return PHONE_NUMBER_PATTERN.test(value.trim())
}

/**
 * Find an existing Contact by name (case-insensitive, org-scoped) or create
 * one with **all** provided details. When creating, email/mobile/phone are
 * stored — never just a bare name (or worse, a phone number as the name).
 *
 * Safeguard against phone-number-as-name:
 *   If `name` looks like a phone number (matches PHONE_NUMBER_PATTERN), the
 *   function will NOT save it as the Contact.name. Instead it tries to match
 *   by `mobile`. If no existing contact has that mobile, it returns null so
 *   no junk Contact row is created.
 *
 * Backfill on match:
 *   When an existing contact is found by name, any *missing* email/mobile
 *   fields supplied in this call are filled in (blanks only, never overwrite).
 *
 * Returns null for blank/whitespace-only name input (no lookup, no create).
 */
export async function findOrCreateContactByName(input: {
  name: string
  organizationId: string
  ownerId: string
  companyId?: string | null
  email?: string | null
  phone?: string | null
  mobile?: string | null
}): Promise<{ id: string; name: string } | null> {
  const trimmedName = input.name?.trim()
  if (!trimmedName) return null

  // --- Safeguard: reject phone-number-looking names ---
  if (looksLikePhoneNumber(trimmedName)) {
    const existingByMobile = await prisma.contact.findFirst({
      where: {
        organizationId: input.organizationId,
        mobile: { equals: trimmedName, mode: 'insensitive' as const },
      },
      select: { id: true, name: true },
    })
    if (existingByMobile) return existingByMobile
    // Don't create a Contact whose display name is a phone number
    return null
  }

  // --- Normal path: look up by name ---
  const existing = await prisma.contact.findFirst({
    where: { organizationId: input.organizationId, name: { equals: trimmedName, mode: 'insensitive' as const } },
    select: { id: true, name: true, email: true, mobile: true },
  })

  if (existing) {
    // Backfill: fill only blank email / mobile fields
    const updates: { email?: string | null; mobile?: string | null; lastActivityAt: Date } = {
      lastActivityAt: new Date(),
    }
    if (input.email && !existing.email) updates.email = input.email
    if (input.mobile && !existing.mobile) updates.mobile = input.mobile

    if ((input.email && !existing.email) || (input.mobile && !existing.mobile)) {
      await prisma.contact.update({
        where: { id: existing.id },
        data: {
          ...updates,
          emailKey: input.email ? buildContactEmailKey(input.email) : undefined,
        },
      })
    }
    return { id: existing.id, name: existing.name }
  }

  // --- Create new contact with full details ---
  const created = await prisma.contact.create({
    data: {
      name: trimmedName,
      organizationId: input.organizationId,
      ownerId: input.ownerId,
      companyId: input.companyId ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      mobile: input.mobile ?? null,
      emailKey: buildContactEmailKey(input.email ?? null),
      lastActivityAt: new Date(),
    },
    select: { id: true, name: true },
  })
  return created
}

