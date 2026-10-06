import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { notFound } from 'next/navigation'
import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { SalesForm } from '@/components/crm/sales-form'
import { requirePermission } from '@/lib/session'
import { PERMISSIONS } from '@/lib/permissions-data'
import { getActiveProductOptions } from '@/services/product.service'
import { getSaleGroup, getSalespeople } from '@/services/sales.service'

export const metadata = { title: 'Edit Sale | Kawman ExAct' }

export default async function EditSalePage({
  params,
}: {
  params: Promise<{ groupId: string }>
}) {
  const session = await requirePermission(PERMISSIONS['sales.update'].name)
  const { groupId } = await params
  const permissions = session.user.permissions as string[]
  const canPickSalesperson = permissions.includes(PERMISSIONS['sales.view_all'].name)

  const rows = await getSaleGroup(groupId)
  if (rows.length === 0) notFound()

  const [products, salespeople] = await Promise.all([
    getActiveProductOptions(),
    canPickSalesperson ? getSalespeople() : Promise.resolve([]),
  ])

  const first = rows[0]
  const total = rows.reduce((sum, row) => sum + row.totalAmount, 0)

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader
          title={`Invoice ${first.invoiceNumber}`}
          subtitle={`${first.customerName} · ${first.saleDate.slice(0, 10)} · ${rows.length} line${rows.length === 1 ? '' : 's'} · ${first.paymentDate ? `paid on ${first.paymentDate.slice(0, 10)}` : 'no payment date'}`}
          action={
            <Link
              href="/sales-tracking"
              className="inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white transition-colors"
            >
              <ArrowLeft className="h-4 w-4" /> Back to sales
            </Link>
          }
        />

        <SalesForm
          products={products}
          salespeople={
            canPickSalesperson
              ? salespeople
              : [
                  {
                    id: first.salespersonId,
                    name: first.salespersonName,
                  },
                ]
          }
          currentUserId={session.user.id}
          canPickSalesperson={canPickSalesperson}
          sale={{ groupId, rows }}
        />

        <p className="text-xs text-white/35">
          Editing rewrites all {rows.length} line{rows.length === 1 ? '' : 's'} of this invoice
          {total > 0 ? ` (currently ${total.toFixed(2)})` : ''}. Adding or removing a product line
          changes the line count for this invoice only.
        </p>
      </div>
    </MainLayout>
  )
}
