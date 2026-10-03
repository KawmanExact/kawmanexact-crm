import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { FieldVisitsTable } from '@/components/field-sales/field-visits-table'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import Link from 'next/link'
import { getTodaysVisits } from '@/services/field-visit.service'

export const metadata = { title: "Today's Visits | Kawman ExAct" }

export default async function TodaysVisitsPage() {
  const visits = await getTodaysVisits()

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader
          title="Today's Visits"
          subtitle={`${visits.length} visits scheduled today`}
          action={
            <Button asChild className="gap-1.5">
              <Link href="/field-sales/new">
                <Plus className="h-4 w-4" />
                Schedule Visit
              </Link>
            </Button>
          }
        />
        <FieldVisitsTable visits={visits} />
      </div>
    </MainLayout>
  )
}
