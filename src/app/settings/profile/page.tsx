import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { requireSession } from '@/lib/session'
import { ProfileForm } from './profile-form'
import { ChangePasswordForm } from './change-password-form'

export const metadata = { title: 'My Profile | Kawman ExAct' }

export default async function ProfilePage() {
  const session = await requireSession()

  return (
    <MainLayout>
      <div className="space-y-6 max-w-3xl">
        <PageHeader title="My Profile" subtitle="Your personal account details" />
        <ProfileForm user={session.user} />
        <ChangePasswordForm />
      </div>
    </MainLayout>
  )
}
