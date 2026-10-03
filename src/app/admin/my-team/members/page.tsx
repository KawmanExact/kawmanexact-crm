import { MainLayout } from '@/components/layout'
import { requirePermission } from '@/lib/session'
import { PageHeader } from '@/components/crm/page-header'
import { getTeamMembers } from '@/services/team.service'
import MembersTableClient from './members-table-client'
import { isOk } from '@/lib/result'

export const metadata = { title: 'Team Members | Kawman ExAct' }

export default async function TeamMembersPage() {
  await requirePermission('team.view_all')

  const membersResult = await getTeamMembers()
  const members = isOk(membersResult) ? membersResult.data : []

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader title="Team Members" subtitle={`${members.length} active members in your organization`} />

        {members.length === 0 ? (
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] py-12 text-center">
            <p className="text-white/40">No team members found.</p>
            <p className="text-white/25 text-sm mt-1">Members appear here once they are invited and activated.</p>
          </div>
        ) : (
          // Reuse existing Badge + STATUS_VARIANT pattern; MembersTableClient handles
          // client-side search + status filter + new live columns over the fetched list
          <MembersTableClient members={members} />
        )}
      </div>
    </MainLayout>
  )
}
