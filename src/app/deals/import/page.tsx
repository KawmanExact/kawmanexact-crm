import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { ImportDealsSection } from '@/components/crm/import-deals-section'

export const metadata = { title: 'Import Deals | Kawman ExAct' }

export default function DealsImportPage() {
  return (
    <MainLayout>
      <div className="space-y-6 max-w-2xl">
        <PageHeader
          title="Import Deals"
          subtitle="Upload a .xlsx or .csv file. Every row becomes a deal entering the pipeline at SUSPECT unless its Status column maps it to a later stage. Columns like Customer Name, Contact Person, Products Discussed, CDA Status and more are matched automatically."
          action={
            <Button asChild variant="ghost" size="sm" className="gap-1.5">
              <Link href="/deals">
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to Deals
              </Link>
            </Button>
          }
        />
        <ImportDealsSection />
      </div>
    </MainLayout>
  )
}