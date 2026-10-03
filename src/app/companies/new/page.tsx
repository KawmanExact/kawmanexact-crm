import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { getOrgUserOptions } from '@/services/user.service'
import type { UserOption } from '@/services/user.service'
import { CompanyForm } from './company-form'
import { isOk } from '@/lib/result'
import { requireApiSession } from '@/lib/session'
import { canManageAssignments } from '@/lib/record-scope'

export const metadata = { title: 'New Company | Kawman ExAct' }

export default async function NewCompanyPage() {
  const ownersResult = await getOrgUserOptions()
  const owners = isOk(ownersResult) ? ownersResult.data : []
  const session = await requireApiSession()
  const canAssign = canManageAssignments(session.user)
  const currentUser: UserOption = { id: session.user.id, name: session.user.name ?? 'Me' }
  return (
    <MainLayout>
      <div className="space-y-6 max-w-3xl">
        <PageHeader title="New Company" subtitle="Add a company to your CRM" />
        <CompanyForm owners={owners} canAssign={canAssign} currentUser={currentUser} />
      </div>
    </MainLayout>
  )
}
