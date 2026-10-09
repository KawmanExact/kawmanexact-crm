import 'server-only'
import { prisma } from '@/lib/db'
import { requireApiSession } from '@/lib/session'

export type FollowUpStatus = 'PENDING' | 'COMPLETED' | 'OVERDUE' | 'CANCELLED'

export type LinkedToType = 'lead' | 'company' | 'contact' | 'deal'

export interface LinkedToChainItem {
  type: LinkedToType
  id: string
  label: string
  href: string
}

/** The follow-up's own level plus the parent levels above it (company, contact, …).
 *  Used by the list to render the full hierarchy, e.g. "Acme Corp / Jane Doe / Deal ABC". */
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
  linkedTo: {
    type: LinkedToType
    id: string
    label: string
    href: string
    /** Parent levels from company down to the level just above `linkedTo`. */
    chain?: LinkedToChainItem[]
  } | null
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
      contact: { select: { id: true, name: true } },
      deal: { select: { id: true, name: true } },
    },
  })

  return rows.map((f) => {
    let linkedTo: FollowUpRow['linkedTo'] = null

    const companyLink: LinkedToChainItem | null = f.company
      ? { type: 'company', id: f.company.id, label: f.company.name, href: `/companies/${f.company.id}` }
      : null
    const contactLink: LinkedToChainItem | null = f.contact
      ? { type: 'contact', id: f.contact.id, label: f.contact.name, href: `/contacts/${f.contact.id}` }
      : null

    if (f.lead) {
      linkedTo = { type: 'lead', id: f.lead.id, label: f.lead.name, href: `/deals?view=leads` }
    } else if (f.deal) {
      const chain: LinkedToChainItem[] = []
      if (companyLink) chain.push(companyLink)
      if (contactLink) chain.push(contactLink)
      linkedTo = { type: 'deal', id: f.deal.id, label: f.deal.name, href: `/deals/${f.deal.id}`, chain }
    } else if (f.contact) {
      const chain: LinkedToChainItem[] = []
      if (companyLink) chain.push(companyLink)
      linkedTo = { type: 'contact', id: f.contact.id, label: f.contact.name, href: `/contacts/${f.contact.id}`, chain }
    } else if (f.company) {
      linkedTo = { type: 'company', id: f.company.id, label: f.company.name, href: `/companies/${f.company.id}` }
    }

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
  /** Optional foreign-key hint so the client can filter the cascade without extra API calls. */
  companyId?: string | null
  contactId?: string | null
}

/** Options for the "link to" dropdowns on the create-follow-up form. */
export async function getFollowUpLinkOptions(): Promise<{
  companies: LinkOption[]
  contacts: LinkOption[]
  deals: LinkOption[]
}> {
  const session = await requireApiSession()
  const organizationId = session.user.organizationId

  const [companies, contacts, deals] = await Promise.all([
    prisma.company.findMany({ where: { organizationId }, select: { id: true, name: true }, orderBy: { name: 'asc' }, take: 200 }),
    prisma.contact.findMany({ where: { organizationId }, select: { id: true, name: true, companyId: true }, orderBy: { name: 'asc' }, take: 200 }),
    prisma.deal.findMany({
      where: { organizationId, stage: { notIn: ['PAYMENT', 'LOST'] } },
      select: { id: true, name: true, contactId: true, companyId: true },
      orderBy: { name: 'asc' },
      take: 200,
    }),
  ])

  return {
    companies: companies.map((c) => ({ id: c.id, label: c.name })),
    contacts: contacts.map((c) => ({ id: c.id, label: c.name, companyId: c.companyId })),
    deals: deals.map((d) => ({ id: d.id, label: d.name, contactId: d.contactId, companyId: d.companyId })),
  }
}
