import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { Card } from '@/components/ui/card'
import { getCategories } from '@/services/file.service'
import { CategoryForm } from './category-form'
import { CategoryList } from './category-list'

export const metadata = { title: 'File Categories | Kawman ExAct' }

export default async function CategoriesPage() {
  const categories = await getCategories()

  return (
    <MainLayout>
      <div className="space-y-8">
        <PageHeader title="Categories" subtitle={`${categories.length} categories`} />

        <Card className="bg-[#0a111c]/80 border-white/[0.08] p-5">
          <CategoryForm />
        </Card>

        <CategoryList categories={categories} />
      </div>
    </MainLayout>
  )
}
