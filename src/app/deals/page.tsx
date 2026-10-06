import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { DealsKanban } from '@/components/crm/deals-kanban'
import { DealsTable } from '@/components/crm/deals-table'
import { ExportCsvButton } from '@/components/crm/export-csv-button'
import { ExportMenu } from '@/components/report-engine/export-menu'
import { buildDealsReport } from '@/lib/report-engine/builders/deals'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import Link from 'next/link'
import { getDeals, getDealsPage, type DealSortKey } from '@/services/deal.service'
import { getOrgUserOptions } from '@/services/user.service'
import { getSession } from '@/lib/session'
import { canManageAssignments } from '@/lib/record-scope'
import { formatCurrency } from '@/lib/utils'
import { isOk } from '@/lib/result'
import { DEAL_PIPELINE_STAGES } from '@/lib/deal-pipeline'
import { ImportDealsButton } from '@/components/crm/import-deals-button'

export const metadata = { title: 'Deals & Pipeline | Kawman ExAct' }

const SORT_KEYS: DealSortKey[] = ['name', 'value', 'lastActivityAt', 'createdAt']

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

/**
 * One segment. Leads and deals are the same record, so there is no separate
 * leads list — `view=list` is the table view of the very same deals the
 * kanban shows, and the board is the default.
 */
function isListView(view: string | undefined): boolean {
  return view === 'list'
}

export default async function DealsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const view = first(params.view)

  const session = await getSession()
  const sessionUser = session?.user as unknown as {
    name?: string
    email?: string
    organization?: { name?: string } | null
  } | undefined
  const generatedBy = sessionUser?.name ?? sessionUser?.email
  const organizationName = sessionUser?.organization?.name ?? undefined

  if (isListView(view)) {
    const search = first(params.q)
    const stageParam = first(params.stage)
    const stage =
      stageParam && DEAL_PIPELINE_STAGES.some((s) => s.id === stageParam) ? stageParam : undefined
    const sortParam = first(params.sort)
    const sortKey = SORT_KEYS.includes(sortParam as DealSortKey) ? (sortParam as DealSortKey) : undefined
    const dirParam = first(params.dir)
    const sortDir = dirParam === 'asc' ? 'asc' : dirParam === 'desc' ? 'desc' : undefined
    const pageParam = Number(first(params.page))
    const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : undefined

    const [result, ownersResult, allDeals] = await Promise.all([
      getDealsPage({ search, stage, sortKey, sortDir, page }),
      getOrgUserOptions(),
      // The export report covers the whole scoped set, not just this page.
      getDeals().catch(() => [] as Awaited<ReturnType<typeof getDeals>>),
    ])
    const owners = isOk(ownersResult) ? ownersResult.data : []
    const canAssign = session ? canManageAssignments(session.user) : false
    const exportReport = buildDealsReport({
      deals: allDeals.length ? allDeals : result.deals,
      generatedBy,
      organizationName,
      filters: {
        ...(search ? { Search: search } : {}),
        ...(stage ? { Stage: stage } : {}),
      },
    })

    return (
      <MainLayout>
        <div className="space-y-6">
          <PageHeader
            title="Deals & Pipeline"
            subtitle={`${result.total} deals in your pipeline`}
            action={
              <div className="flex items-center gap-2 flex-wrap">
                <ImportDealsButton />
                {/* <ExportCsvButton href="/api/deals/export?format=csv" /> */}
                <ExportMenu report={exportReport} />
                <Button asChild className="gap-1.5">
                  <Link href="/deals/new">
                    <Plus className="h-4 w-4" />
                    New Deal
                  </Link>
                </Button>
              </div>
            }
          />
          <SegmentTabs view="list" />
          <DealsTable result={result} owners={owners} canAssign={canAssign} />
        </div>
      </MainLayout>
    )
  }

  const search = first(params.q)
  const deals = await getDeals(search)
  const totalValue = deals.reduce((sum, d) => sum + d.value, 0)
  const exportReport = buildDealsReport({
    deals,
    generatedBy,
    organizationName,
    filters: search ? { Search: search } : undefined,
  })

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader
          title="Deals & Pipeline"
          subtitle={`${deals.length} deals • ${formatCurrency(totalValue)} total pipeline value — drag cards between stages`}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <ExportCsvButton href="/api/deals/export?format=csv" />
              <ExportMenu report={exportReport} />
              <Button asChild className="gap-1.5">
                <Link href="/deals/new">
                  <Plus className="h-4 w-4" />
                  New Deal
                </Link>
              </Button>
            </div>
          }
        />
        <SegmentTabs view="board" />
        <DealsKanban deals={deals} />
      </div>
    </MainLayout>
  )
}

/**
 * The board and the table are two views of one record, so the tab lives here
 * rather than in a nested route. Each tab link drops the other view's filter
 * params instead of carrying them over — a lead status filter would silently
 * hide deals.
 */
function SegmentTabs({ view }: { view: 'board' | 'list' }) {
  const tabs = [
    { id: 'board' as const, label: 'Pipeline', href: '/deals' },
    { id: 'list' as const, label: 'All Deals', href: '/deals?view=list' },
  ]

  return (
    <div className="flex rounded-lg border border-white/[0.08] bg-white/[0.02] p-0.5 text-sm w-fit">
      {tabs.map((tab) => (
        <Link
          key={tab.id}
          href={tab.href}
          aria-current={view === tab.id ? 'page' : undefined}
          className={
            view === tab.id
              ? 'px-3.5 py-1.5 rounded-md bg-purple-600 text-white font-medium'
              : 'px-3.5 py-1.5 rounded-md text-white/50 hover:text-white font-medium transition-colors'
          }
        >
          {tab.label}
        </Link>
      ))}
    </div>
  )
}