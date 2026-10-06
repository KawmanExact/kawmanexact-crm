import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { SalesForm } from '@/components/crm/sales-form'
import { requirePermission } from '@/lib/session'
import { PERMISSIONS } from '@/lib/permissions-data'
import { getActiveProductOptions } from '@/services/product.service'
import { getSalespeople } from '@/services/sales.service'

export const metadata = { title: 'Record Sale | Kawman ExAct' }

export default async function NewSalePage() {
  const session = await requirePermission(PERMISSIONS['sales.create'].name)
  const permissions = session.user.permissions as string[]
  // Only sales.view_all holders may file a sale under somebody else's name;
  // the server action forces salespersonId back to the caller otherwise.
  const canPickSalesperson = permissions.includes(PERMISSIONS['sales.view_all'].name)

  const [products, salespeople] = await Promise.all([
    getActiveProductOptions(),
    canPickSalesperson ? getSalespeople() : Promise.resolve([]),
  ])

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader
          title="Record Sale"
          subtitle="One entry per invoice. Every product becomes its own sales line."
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
                    id: session.user.id,
                    name: session.user.name ?? session.user.email ?? 'You',
                  },
                ]
          }
          currentUserId={session.user.id}
          canPickSalesperson={canPickSalesperson}
        />
      </div>
    </MainLayout>
  )
}
