import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { ProductForm } from '@/components/crm/product-form'
import { requirePermission } from '@/lib/session'
import { PERMISSIONS } from '@/lib/permissions-data'

export const metadata = { title: 'Add Product | Kawman ExAct' }

export default async function NewProductPage() {
  await requirePermission(PERMISSIONS['products.manage'].name)

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader
          title="Add Product"
          subtitle="Catalog entries appear in the sales product dropdown and are matched by the lead importer"
          action={
            <Link
              href="/sales-tracking/products"
              className="inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white transition-colors"
            >
              <ArrowLeft className="h-4 w-4" /> Back to catalog
            </Link>
          }
        />
        <ProductForm />
      </div>
    </MainLayout>
  )
}
