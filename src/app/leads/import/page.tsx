import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { ImportLeadsSection } from '@/components/crm/import-leads-section'

export const metadata = { title: 'Import Leads | Kawman ExAct' }

export default function LeadsImportPage() {
  return (
    <MainLayout>
      <div className="space-y-6 max-w-2xl">
        <PageHeader
          title="Import Leads"
          subtitle="Upload a CSV file to bulk-create leads"
          action={
            <Button asChild variant="ghost" size="sm" className="gap-1.5">
              <Link href="/leads">
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to Leads
              </Link>
            </Button>
          }
        />
        <ImportLeadsSection />
      </div>
    </MainLayout>
  )
}
