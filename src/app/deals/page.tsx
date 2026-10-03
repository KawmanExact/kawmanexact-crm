import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { DealsKanban } from '@/components/crm/deals-kanban'
import { ExportCsvButton } from '@/components/crm/export-csv-button'
import { ExportMenu } from '@/components/report-engine/export-menu'
import { buildDealsReport } from '@/lib/report-engine/builders/deals'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import Link from 'next/link'
import { getDeals } from '@/services/deal.service'
import { getSession } from '@/lib/session'
import { formatCurrency } from '@/lib/utils'

export const metadata = { title: 'Deals & Pipeline | Kawman ExAct' }

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export default async function DealsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const search = first(params.q)
  const [deals, session] = await Promise.all([getDeals(search), getSession()])
  const totalValue = deals.reduce((sum, d) => sum + d.value, 0)

  const sessionUser = session?.user as unknown as { name?: string; email?: string; organization?: { name?: string } | null } | undefined
  const exportReport = buildDealsReport({
    deals,
    generatedBy: sessionUser?.name ?? sessionUser?.email,
    organizationName: sessionUser?.organization?.name ?? undefined,
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
              <ExportCsvButton href="/api/deals/export" />
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
        <DealsKanban deals={deals} />
      </div>
    </MainLayout>
  )
}
