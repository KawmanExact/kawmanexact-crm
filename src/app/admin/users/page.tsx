import Link from 'next/link'
import { Plus } from 'lucide-react'
import { MainLayout } from '@/components/layout'
import { requirePermission } from '@/lib/session'
import { PageHeader } from '@/components/crm/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { getOrgUsers } from '@/services/user.service'
import { getInitials } from '@/lib/utils'

export const metadata = { title: 'Users | Kawman ExAct Admin' }

const STATUS_VARIANT: Record<string, 'success' | 'neutral' | 'danger' | 'warning'> = {
  ACTIVE: 'success',
  INACTIVE: 'neutral',
  SUSPENDED: 'danger',
  INVITED: 'warning',
}

export default async function AdminUsersPage() {
  await requirePermission('users.view')

  const usersResult = await getOrgUsers()
  if (!usersResult.success) {
    return (
      <MainLayout>
        <div className="space-y-6">
          <PageHeader title="Users" subtitle="Error loading users" />
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-300">
            {usersResult.error}
          </div>
        </div>
      </MainLayout>
    )
  }
  const users = usersResult.data

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader
          title="Users"
          subtitle={`${users.length} people in your organization`}
          action={
            <Link href="/admin/users/new">
              <Button>
                <Plus className="h-4 w-4 mr-2" /> Add user
              </Button>
            </Link>
          }
        />

        <div className="rounded-xl border border-white/[0.08] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.03] text-white/50 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Department / Team</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Last login</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-white/[0.02]">
                  <td className="px-4 py-3">
                    <Link href={`/admin/users/${u.id}`} className="flex items-center gap-3 group">
                      <div className="h-8 w-8 rounded-full bg-purple-500/20 text-purple-300 flex items-center justify-center text-xs font-semibold shrink-0">
                        {getInitials(u.name)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-white group-hover:text-purple-300 transition-colors">{u.name}</p>
                        <p className="text-white/40 text-xs">{u.email}</p>
                      </div>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-white/70">{u.role?.replace(/_/g, ' ') ?? '—'}</td>
                  <td className="px-4 py-3 text-white/60">
                    {u.department ?? '—'}
                    {u.team && <span className="text-white/35"> / {u.team}</span>}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_VARIANT[u.status] ?? 'neutral'}>{u.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-white/40">
                    {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString('en-IN') : 'Never'}
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-white/40">
                    No users yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </MainLayout>
  )
}
