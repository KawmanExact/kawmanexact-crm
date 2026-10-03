import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { LiveMap } from '@/components/field-sales/live-map'
import { getLiveMapVisits, getActiveUsersForMap } from '@/services/field-visit.service'

export const metadata = { title: 'Live Map | Kawman ExAct' }

export default async function LiveMapPage() {
  const [visits, activeUsers] = await Promise.all([getLiveMapVisits(), getActiveUsersForMap()])

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader title="Live Map" subtitle={`${visits.length} visits · ${activeUsers.length} active reps`} />
        <LiveMap initialVisits={visits} initialActiveUsers={activeUsers} />
      </div>
    </MainLayout>
  )
}
