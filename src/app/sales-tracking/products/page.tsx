import Link from 'next/link'
import { Plus } from 'lucide-react'
import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { ProductsTable } from '@/components/crm/products-table'
import { Button } from '@/components/ui/button'
import { getSession, requirePermission } from '@/lib/session'
import { PERMISSIONS } from '@/lib/permissions-data'
import { getOtherProductNames } from '@/services/sales.service'
import { getProductCategories, getProducts } from '@/services/product.service'

export const metadata = { title: 'Product Catalog | Kawman ExAct' }

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requirePermission(PERMISSIONS['products.view'].name)

  const params = await searchParams
  const q = first(params.q)?.trim()
  const category = first(params.category)?.trim()
  const activeParam = first(params.active)
  const isActive = activeParam === 'true' ? true : activeParam === 'false' ? false : undefined

  const permissions = session.user.permissions as string[]
  const canManage = permissions.includes(PERMISSIONS['products.manage'].name)
  const canViewSales = permissions.includes(PERMISSIONS['sales.view'].name)

  const [products, categories, otherNames] = await Promise.all([
    getProducts({ q, category, isActive }),
    getProductCategories(),
    // A user without sales.view has no business seeing what was sold, so the
    // "Other products" panel is fed nothing for them.
    canViewSales
      ? getOtherProductNames().catch(() => [] as Array<{ name: string; count: number }>)
      : Promise.resolve([] as Array<{ name: string; count: number }>),
  ])

  const activeCount = products.filter((p) => p.isActive).length

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader
          title="Product Catalog"
          subtitle={`${activeCount} active of ${products.length} product${products.length === 1 ? '' : 's'} — reused by the sales entry form and the lead importer`}
          action={
            canManage ? (
              <Button asChild className="gap-1.5">
                <Link href="/sales-tracking/products/new">
                  <Plus className="h-4 w-4" /> Add Product
                </Link>
              </Button>
            ) : null
          }
        />

        <ProductsTable
          products={products}
          categories={categories}
          otherNames={otherNames}
          canManage={canManage}
        />
      </div>
    </MainLayout>
  )
}
