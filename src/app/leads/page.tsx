import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { LeadsTable } from '@/components/crm/leads-table'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import Link from 'next/link'
import { getLeads, getLeadsPage, type LeadSortKey } from '@/services/lead.service'
import { getOrgUserOptions } from '@/services/user.service'
import type { LeadStatus } from '@/types/crm'
import { RecalculateAllScoresButton } from '@/components/crm/recalculate-all-scores-button'
import { ExportCsvButton } from '@/components/crm/export-csv-button'
import { ExportMenu } from '@/components/report-engine/export-menu'
import { buildLeadsReport } from '@/lib/report-engine/builders/leads'
import { getSession } from '@/lib/session'
import { canManageAssignments } from '@/lib/record-scope'
import { ImportLeadsButton } from '@/components/crm/import-leads-button'
import { isOk } from '@/lib/result'

export const metadata = { title: 'Leads | Kawman ExAct' }

const SORT_KEYS: LeadSortKey[] = ['name', 'score', 'value', 'lastActivityAt', 'createdAt']
const STATUSES: LeadStatus[] = ['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST']

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams

  const search = first(params.q)
  const statusParam = first(params.status)
  const status = statusParam && STATUSES.includes(statusParam as LeadStatus) ? (statusParam as LeadStatus) : undefined
  const sortParam = first(params.sort)
  const sortKey = SORT_KEYS.includes(sortParam as LeadSortKey) ? (sortParam as LeadSortKey) : undefined
  const dirParam = first(params.dir)
  const sortDir = dirParam === 'asc' ? 'asc' : dirParam === 'desc' ? 'desc' : undefined
  const pageParam = Number(first(params.page))
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : undefined

  // Current page view (filtered + paginated) for the table; full scoped set for export
  const [result, ownersResult, session, allLeads] = await Promise.all([
    getLeadsPage({ search, status, sortKey, sortDir, page }),
    getOrgUserOptions(),
    getSession(),
    getLeads().catch(() => [] as Awaited<ReturnType<typeof getLeads>>),
  ])
  const owners = isOk(ownersResult) ? ownersResult.data : []

  const canAssign = session ? canManageAssignments(session.user) : false

  const sessionUser = session?.user as unknown as { name?: string; email?: string; organization?: { name?: string } | null } | undefined
  const exportReport = buildLeadsReport({
    leads: allLeads.length ? allLeads : result.leads,
    generatedBy: sessionUser?.name ?? sessionUser?.email,
    organizationName: sessionUser?.organization?.name ?? undefined,
    filters: {
      ...(search ? { Search: search } : {}),
      ...(status ? { Status: status } : {}),
    },
  })

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader
          title="Leads"
          subtitle={`${result.total} leads in your pipeline`}
          action={
            <div className="flex items-center gap-2 flex-wrap">
              <RecalculateAllScoresButton />
              <ImportLeadsButton />
              <ExportCsvButton href="/api/leads/export" />
              <ExportMenu report={exportReport} />
              <Button asChild className="gap-1.5">
                <Link href="/leads/new">
                  <Plus className="h-4 w-4" />
                  New Lead
                </Link>
              </Button>
            </div>
          }
        />
        <LeadsTable result={result} owners={owners} canAssign={canAssign} />
      </div>
    </MainLayout>
  )
}
