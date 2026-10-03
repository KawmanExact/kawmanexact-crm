import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { getOrgUserOptions } from '@/services/user.service'
import { DealForm } from './deal-form'
import { isOk } from '@/lib/result'
import { requireApiSession } from '@/lib/session'
import { canManageAssignments } from '@/lib/record-scope'
import type { UserOption } from '@/services/user.service'

export const metadata = { title: 'New Deal | Kawman ExAct' }

export default async function NewDealPage() {
  const ownersResult = await getOrgUserOptions()
  const owners = isOk(ownersResult) ? ownersResult.data : []
  const session = await requireApiSession()
  const canAssign = canManageAssignments(session.user)
  const currentUser: UserOption = { id: session.user.id, name: session.user.name ?? 'Me' }
  return (
    <MainLayout>
      <div className="space-y-6 max-w-3xl">
        <PageHeader title="New Deal" subtitle="Add an opportunity to your pipeline" />
        <DealForm owners={owners} canAssign={canAssign} currentUser={currentUser} />
      </div>
    </MainLayout>
  )
}
