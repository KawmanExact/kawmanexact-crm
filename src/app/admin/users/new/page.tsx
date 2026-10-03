import { MainLayout } from '@/components/layout'
import { requirePermission } from '@/lib/session'
import { PageHeader } from '@/components/crm/page-header'
import { getDepartments, getTeams } from '@/services/org-structure.service'
import { NewUserForm } from './user-form'

export const metadata = { title: 'New User | Kawman ExAct Admin' }

export default async function NewUserPage() {
  await requirePermission('users.create')

  const [departments, teams] = await Promise.all([getDepartments(), getTeams()])
  return (
    <MainLayout>
      <div className="space-y-6 max-w-3xl">
        <PageHeader title="Add User" subtitle="Invite a teammate to your organization" />
        <NewUserForm departments={departments} teams={teams} />
      </div>
    </MainLayout>
  )
}
