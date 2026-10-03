import 'server-only'
import { prisma } from '@/lib/db'
import { requireApiSession } from '@/lib/session'
import { getLatestActionMap } from './file.service'

export type SearchResultType = 'lead' | 'company' | 'contact' | 'deal' | 'meeting' | 'file'

export interface SearchResult {
  type: SearchResultType
  id: string
  title: string
  subtitle: string
  href: string
}

const RESULTS_PER_TYPE = 5

/**
 * Global search (audit: "Advanced Search — Only client-side filter on
 * current page data"). Fans out to every major entity type in parallel,
 * all org-scoped, all limited to a handful of results per type — this is
 * a command-palette jump-to tool, not a full search results page, so
 * completeness matters less than speed and relevance of the top hits.
 */
export async function globalSearch(query: string): Promise<SearchResult[]> {
  const q = query.trim()
  if (q.length < 2) return []

  const session = await requireApiSession()
  const organizationId = session.user.organizationId
  const contains = { contains: q, mode: 'insensitive' as const }

  const [leads, companies, contacts, deals, meetings, files] = await Promise.all([
    prisma.lead.findMany({
      where: { organizationId, OR: [{ name: contains }, { company: contains }, { email: contains }] },
      select: { id: true, name: true, company: true, status: true },
      take: RESULTS_PER_TYPE,
    }),
    prisma.company.findMany({
      where: { organizationId, OR: [{ name: contains }, { industry: contains }] },
      select: { id: true, name: true, industry: true },
      take: RESULTS_PER_TYPE,
    }),
    prisma.contact.findMany({
      where: { organizationId, OR: [{ name: contains }, { email: contains }] },
      select: { id: true, name: true, designation: true, company: { select: { name: true } } },
      take: RESULTS_PER_TYPE,
    }),
    prisma.deal.findMany({
      where: { organizationId, name: contains },
      select: { id: true, name: true, stage: true, value: true },
      take: RESULTS_PER_TYPE,
    }),
    prisma.meeting.findMany({
      where: { organizationId, title: contains },
      select: { id: true, title: true, scheduledAt: true },
      take: RESULTS_PER_TYPE,
    }),
    prisma.file.findMany({
      where: { organizationId, originalName: contains },
      select: { id: true, originalName: true, folderId: true },
      // Over-fetch slightly since trashed files get filtered out below.
      take: RESULTS_PER_TYPE * 2,
    }),
  ])

  // File trash state isn't a column (see file.service.ts) — it's derived
  // from the most recent TRASHED/RESTORED activity log entry, so exclude
  // trashed files the same way the rest of the app does.
  const trashMap = await getLatestActionMap(
    files.map((f) => f.id),
    ['TRASHED', 'RESTORED']
  )
  const activeFiles = files.filter((f) => trashMap.get(f.id) !== 'TRASHED').slice(0, RESULTS_PER_TYPE)

  const results: SearchResult[] = [
    ...leads.map((l) => ({
      type: 'lead' as const,
      id: l.id,
      title: l.name,
      subtitle: `Lead · ${l.company ?? l.status}`,
      href: `/leads/${l.id}`,
    })),
    ...companies.map((c) => ({
      type: 'company' as const,
      id: c.id,
      title: c.name,
      subtitle: `Company${c.industry ? ` · ${c.industry}` : ''}`,
      href: `/companies/${c.id}`,
    })),
    ...contacts.map((c) => ({
      type: 'contact' as const,
      id: c.id,
      title: c.name,
      subtitle: `Contact · ${c.company?.name ?? c.designation ?? ''}`,
      href: `/contacts/${c.id}`,
    })),
    ...deals.map((d) => ({
      type: 'deal' as const,
      id: d.id,
      title: d.name,
      subtitle: `Deal · ${d.stage.replace('_', ' ')} · ₹${Number(d.value).toLocaleString('en-IN')}`,
      href: `/deals/${d.id}`,
    })),
    ...meetings.map((m) => ({
      type: 'meeting' as const,
      id: m.id,
      title: m.title,
      subtitle: `Meeting · ${m.scheduledAt ? m.scheduledAt.toLocaleDateString('en-IN') : 'No date'}`,
      href: `/meetings/${m.id}`,
    })),
    ...activeFiles.map((f) => ({
      type: 'file' as const,
      id: f.id,
      title: f.originalName,
      subtitle: 'File',
      href: f.folderId ? `/files/my-files?folder=${f.folderId}` : '/files/my-files',
    })),
  ]

  return results
}
