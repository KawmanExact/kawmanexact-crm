import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { getOrgUserOptions } from '@/services/user.service'
import { requireSession } from '@/lib/session'
import { NewMeetingForm } from './meeting-form'
import { isOk } from '@/lib/result'

export const metadata = { title: 'New Meeting (MOM) | Kawman ExAct' }

export default async function NewMeetingPage() {
  const session = await requireSession()
  const usersResult = await getOrgUserOptions()
  const users = isOk(usersResult) ? usersResult.data : []

  return (
    <MainLayout>
      <div className="space-y-6 max-w-3xl">
        <PageHeader title="New Meeting" subtitle="Upload a recording to transcribe and generate MOM & insights" />
        <NewMeetingForm users={users} currentUserId={session.user.id} />
      </div>
    </MainLayout>
  )
}
