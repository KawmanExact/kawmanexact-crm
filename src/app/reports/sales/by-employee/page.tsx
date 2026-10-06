import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { ExportMenu } from '@/components/report-engine/export-menu'
import { ProductSalesByEmployeeView } from '@/components/reports/product-sales-by-employee-view'
import { buildProductSalesReport } from '@/lib/report-engine/builders/product-sales'
import {
  getProductSalesByEmployee,
  PRODUCT_SALES_DEFAULT_WINDOW_DAYS,
} from '@/services/crm-reports.service'
import { getSession } from '@/lib/session'

export const metadata = { title: 'Product Sales by Employee | Kawman ExAct' }

const MS_PER_DAY = 24 * 60 * 60 * 1000

function first(v: string | string[] | undefined): string | undefined {
  const value = Array.isArray(v) ? v[0] : v
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

/**
 * Parse a `YYYY-MM-DD` query value into local midnight. Local (not UTC) so the
 * day the user picked is the day the server compares against — the same
 * convention getSalesReportData's month buckets use.
 */
function parseDay(value: string | undefined): Date | null {
  if (!value) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(d.getTime()) ? null : d
}

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function dayLabel(d: Date): string {
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default async function ProductSalesByEmployeePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [params, session] = await Promise.all([searchParams, getSession()])
  const permissions = ((session?.user.permissions as string[] | undefined) ?? [])
  // Cost, profit and margin are commercially sensitive. `reports.view_all` is
  // the existing permission that gates team-wide visibility — there is no
  // dedicated `reports.view_cost` in lib/permissions-data.ts and this report
  // deliberately does not invent one.
  const canViewCost = permissions.includes('reports.view_all')

  const fromParam = first(params.from)
  const toParam = first(params.to)
  const parsedFrom = parseDay(fromParam)
  const parsedTo = parseDay(toParam)

  const to = parsedTo ?? new Date()
  const from = parsedFrom ?? new Date(to.getTime() - PRODUCT_SALES_DEFAULT_WINDOW_DAYS * MS_PER_DAY)

  // The service window is half-open ([from, to)). A `<input type="date">`
  // gives a calendar day the user means inclusively, so stretch `to` to the
  // last millisecond of that day before handing it over.
  const rangeEnd = new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999)

  const data = await getProductSalesByEmployee({ from, to: rangeEnd })
  const periodLabel = `${dayLabel(from)} – ${dayLabel(to)}`

  const sessionUser = session?.user as unknown as
    | { name?: string; email?: string; organization?: { name?: string } | null }
    | undefined
  const exportReport = buildProductSalesReport({
    data,
    generatedBy: sessionUser?.name ?? sessionUser?.email,
    organizationName: sessionUser?.organization?.name ?? undefined,
    periodLabel,
    canViewCost,
  })

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader
          title="Product Sales by Employee"
          subtitle="Which employee sold which product, and how much margin it earned — won deals only"
          action={<ExportMenu report={exportReport} />}
        />
        <ProductSalesByEmployeeView
          data={data}
          canViewCost={canViewCost}
          from={isoDay(from)}
          to={isoDay(to)}
        />
      </div>
    </MainLayout>
  )
}