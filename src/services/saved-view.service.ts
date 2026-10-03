import 'server-only'
import { prisma } from '@/lib/db'
import { requireApiSession } from '@/lib/session'
import type { Prisma } from '@/generated/prisma'

export interface SavedViewItem {
  id: string
  name: string
  /** The exact query-string params to re-apply, e.g. { status: 'QUALIFIED', sort: 'score', dir: 'desc' }. */
  filters: Record<string, string>
  createdAt: string
}

/** `page` is a stable key like "leads" — one list of saved views per page, scoped to the current user (not shared org-wide). */
export async function getSavedViews(page: string): Promise<SavedViewItem[]> {
  const session = await requireApiSession()
  const rows = await prisma.savedView.findMany({
    where: { page, userId: session.user.id, organizationId: session.user.organizationId },
    orderBy: { createdAt: 'asc' },
  })
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    filters: (r.filters as Record<string, string>) ?? {},
    createdAt: r.createdAt.toISOString(),
  }))
}

export async function createSavedView(
  page: string,
  name: string,
  filters: Record<string, string>
): Promise<SavedViewItem> {
  const session = await requireApiSession()
  const row = await prisma.savedView.create({
    data: {
      page,
      name,
      filters: filters as Prisma.InputJsonValue,
      organizationId: session.user.organizationId,
      userId: session.user.id,
    },
  })
  return {
    id: row.id,
    name: row.name,
    filters: (row.filters as Record<string, string>) ?? {},
    createdAt: row.createdAt.toISOString(),
  }
}

export async function deleteSavedView(id: string): Promise<void> {
  const session = await requireApiSession()
  await prisma.savedView.deleteMany({ where: { id, userId: session.user.id } })
}
