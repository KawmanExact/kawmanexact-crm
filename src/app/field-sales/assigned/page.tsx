import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { AssignedVisitsTable } from '@/components/field-sales/assigned-visits-table'
import { getAssignedVisits } from '@/services/field-visit.service'

export const metadata = { title: 'Assigned to Me | Field Sales | Kawman ExAct' }

export default async function AssignedVisitsPage() {
  const visits = await getAssignedVisits()

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader
          title="Assigned to Me"
          subtitle={`${visits.length} visit${visits.length === 1 ? '' : 's'} assigned to you — check in on-site with a face photo to verify`}
        />
        <AssignedVisitsTable visits={visits} />
      </div>
    </MainLayout>
  )
}
