import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { VisitForm, type VisitFormInitialValues } from './visit-form'
import { getOrgUserOptions } from '@/services/user.service'
import type { UserOption } from '@/services/user.service'
import { isOk } from '@/lib/result'
import { requireApiSession } from '@/lib/session'
import { canManageAssignments } from '@/lib/record-scope'
import { getDealById } from '@/services/deal.service'

export const metadata = { title: 'Schedule Visit | Kawman ExAct' }

export default async function NewFieldVisitPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireApiSession()
  const canAssign = canManageAssignments(session.user)
  const currentUser: UserOption = { id: session.user.id, name: session.user.name ?? 'Me' }

  const params = await searchParams
  const dealId = Array.isArray(params.deal) ? params.deal[0] : params.deal

  const [ownersResult, deal] = await Promise.all([getOrgUserOptions(), dealId ? getDealById(dealId) : null])
  const owners = isOk(ownersResult) ? ownersResult.data : []

  let initialValues: VisitFormInitialValues | undefined
  if (deal) {
    initialValues = {
      company: deal.company === '—' ? undefined : deal.company,
      contactName: deal.contactPerson ?? deal.contact ?? undefined,
      contactEmail: deal.contactEmail ?? undefined,
      contactMobile: deal.contactMobile ?? undefined,
      address: deal.meetingAt
        ? deal.meetingAt
        : [deal.city, deal.country, deal.pinCode].filter(Boolean).join(', ') || undefined,
      purpose: deal.purposeOfVisit ?? undefined,
    }
  }

  return (
    <MainLayout>
      <div className="space-y-6 max-w-3xl">
        <PageHeader title="Schedule Visit" subtitle={dealId ? 'Pre-filled from a lead' : 'Plan a field visit for a rep'} />
        <VisitForm
          mode="create"
          initialValues={initialValues}
          owners={owners}
          canAssign={canAssign}
          currentUser={currentUser}
        />
      </div>
    </MainLayout>
  )
}
