import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { notFound } from 'next/navigation'
import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { ProductForm } from '@/components/crm/product-form'
import { requirePermission } from '@/lib/session'
import { PERMISSIONS } from '@/lib/permissions-data'
import { getProductById } from '@/services/product.service'

export const metadata = { title: 'Edit Product | Kawman ExAct' }

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission(PERMISSIONS['products.manage'].name)
  const { id } = await params

  const product = await getProductById(id)
  if (!product) notFound()

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader
          title={product.name}
          subtitle={`${product.variant ? `${product.variant} · ` : ''}${product.salesCount > 0 ? `used in ${product.salesCount} sales line${product.salesCount === 1 ? '' : 's'}` : 'not used in any sale yet'}`}
          action={
            <Link
              href="/sales-tracking/products"
              className="inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white transition-colors"
            >
              <ArrowLeft className="h-4 w-4" /> Back to catalog
            </Link>
          }
        />
        <ProductForm product={product} />
      </div>
    </MainLayout>
  )
}
