import { MainLayout } from '@/components/layout'
import Link from 'next/link'
import { PageHeader } from '@/components/crm/page-header'
import { SalesTrackingView } from '@/components/crm/sales-tracking-view'
import { SalesPrintView } from '@/components/crm/sales-print-view'
import {
  SalesKpiCards,
  SalespersonSummary,
  SalespersonMatrix,
} from '@/components/crm/sales-kpi-cards'
import { Button } from '@/components/ui/button'
import { PERMISSIONS } from '@/lib/permissions-data'
import { requirePermission } from '@/lib/session'
import { getSalesPage, getSalesExportMeta } from '@/services/sales.service'
import { getSalesFilterOptions } from '@/services/sales-options'
import type { RawQuery } from '@/lib/sales-filters'

export const metadata = { title: 'Sales Product Tracking | Kawman ExAct' }
export const dynamic = 'force-dynamic'

export default async function SalesTrackingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requirePermission(PERMISSIONS['sales.view'].name)
  const params = await searchParams

  const isPrint = params.print === '1'
  const permissions = session.user.permissions as string[]

  const [data, { options, canPickSalesperson }] = await Promise.all([
    getSalesPage(params as RawQuery),
    getSalesFilterOptions(),
  ])

  // ?print=1 renders the light, chrome-free document in a new tab; everything
  // else goes through the normal layout. Both read the same server data.
  if (isPrint) {
    const meta = await getSalesExportMeta()
    return <SalesPrintView data={data} organizationName={meta.organizationName} generatedBy={meta.generatedBy} />
  }

  const canCreate = permissions.includes(PERMISSIONS['sales.create'].name)
  const canEdit = permissions.includes(PERMISSIONS['sales.update'].name)
  const canDelete = permissions.includes(PERMISSIONS['sales.delete'].name)
  const canExport = permissions.includes(PERMISSIONS['sales.export'].name)

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader
          title="Sales Product Tracking"
          subtitle={`${data.total} product line${data.total === 1 ? '' : 's'} across ${data.kpis.totalSales} invoice${data.kpis.totalSales === 1 ? '' : 's'}`}
          action={
            canCreate ? (
              <Button asChild className="gap-1.5">
                <Link href="/sales-tracking/new">+ Record Sale</Link>
              </Button>
            ) : null
          }
        />

        <SalesKpiCards kpis={data.kpis} truncated={data.truncated} />

        {data.salespersonSummary ? (
          <SalespersonSummary summary={data.salespersonSummary} />
        ) : data.salespersonBreakdown.length > 1 ? (
          <SalespersonMatrix rows={data.salespersonBreakdown} />
        ) : null}

        <SalesTrackingView
          data={data}
          options={options}
          canEdit={canEdit}
          canDelete={canDelete}
          canExport={canExport}
          canPickSalesperson={canPickSalesperson}
        />

        </div>
    </MainLayout>
  )
}