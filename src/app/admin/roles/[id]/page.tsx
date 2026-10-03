import { notFound } from 'next/navigation'
import { MainLayout } from '@/components/layout'
import { requirePermission } from '@/lib/session'
import { PageHeader } from '@/components/crm/page-header'
import { getRoleById, getAllPermissions } from '@/services/role.service'
import { PermissionMatrix } from './permission-matrix'
import { isOk } from '@/lib/result'

export const metadata = { title: 'Role Detail | Kawman ExAct Admin' }

export default async function AdminRoleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('roles.view')

  const { id } = await params
  const [roleResult, permissionsResult] = await Promise.all([getRoleById(id), getAllPermissions()])
  if (!roleResult.success || !roleResult.data) notFound()
  const role = roleResult.data
  const permissions = isOk(permissionsResult) ? permissionsResult.data : []

  return (
    <MainLayout>
      <div className="space-y-6 max-w-3xl">
        <PageHeader title={role.name.replace(/_/g, ' ')} subtitle={role.description ?? 'System role'} />
        <PermissionMatrix
          roleId={role.id}
          roleName={role.name}
          permissions={permissions}
          grantedIds={Array.from(role.grantedPermissionIds)}
        />
      </div>
    </MainLayout>
  )
}
