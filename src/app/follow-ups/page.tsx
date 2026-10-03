import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { getFollowUps, getFollowUpLinkOptions } from '@/services/followup.service'
import { FollowUpsView } from './follow-ups-view'

export const metadata = { title: 'Follow-ups | Kawman ExAct' }

export default async function FollowUpsPage() {
  const [followUps, linkOptions] = await Promise.all([getFollowUps(), getFollowUpLinkOptions()])
  const pendingCount = followUps.filter((f) => f.status === 'PENDING').length
  const overdueCount = followUps.filter((f) => f.isOverdue).length

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader
          title="Follow-ups"
          subtitle={`${pendingCount} pending${overdueCount > 0 ? ` · ${overdueCount} overdue` : ''}`}
        />
        <FollowUpsView followUps={followUps} linkOptions={linkOptions} />
      </div>
    </MainLayout>
  )
}
