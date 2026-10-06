import 'server-only'
import { prisma } from '@/lib/db'
import { requireApiSession } from '@/lib/session'
import { getLatestActionMap } from './file.service'

export type SearchResultType = 'company' | 'contact' | 'deal' | 'file'

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

  const [companies, contacts, deals, files] = await Promise.all([
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
    // A deal IS the lead now, so this is also the enquiry search — it reaches the
    // merged capture columns, not just the pipeline name.
    prisma.deal.findMany({
      where: {
        organizationId,
        OR: [
          { name: contains },
          { email: contains },
          { phone: contains },
          { contactPerson: contains },
          { company: { name: contains } },
        ],
      },
      select: { id: true, name: true, stage: true, value: true },
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
