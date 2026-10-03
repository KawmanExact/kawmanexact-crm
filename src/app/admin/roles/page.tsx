import Link from 'next/link'
import { ShieldCheck } from 'lucide-react'
import { MainLayout } from '@/components/layout'
import { requirePermission } from '@/lib/session'
import { PageHeader } from '@/components/crm/page-header'
import { getRoles } from '@/services/role.service'
import { isOk } from '@/lib/result'

export const metadata = { title: 'Roles & Permissions | Kawman ExAct Admin' }

export default async function AdminRolesPage() {
  await requirePermission('roles.view')

  const rolesResult = await getRoles()
  const roles = isOk(rolesResult) ? rolesResult.data : []

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader
          title="Roles & Permissions"
          subtitle="System roles are fixed, but what each one can do is fully customizable."
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {roles.map((role) => (
            <Link
              key={role.id}
              href={`/admin/roles/${role.id}`}
              className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-5 hover:border-purple-500/30 hover:bg-white/[0.05] transition-colors"
            >
              <div className="flex items-center gap-2 mb-2">
                <ShieldCheck className="h-4 w-4 text-purple-400" />
                <h3 className="text-white font-medium">{role.name.replace(/_/g, ' ')}</h3>
              </div>
              {role.description && <p className="text-sm text-white/45 mb-3">{role.description}</p>}
              <div className="flex gap-4 text-xs text-white/40">
                <span>{role.userCount} user{role.userCount === 1 ? '' : 's'}</span>
                <span>{role.permissionCount} permission{role.permissionCount === 1 ? '' : 's'}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </MainLayout>
  )
}
