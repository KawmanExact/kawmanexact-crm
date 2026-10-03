import { MainLayout } from '@/components/layout'
import { requirePermission } from '@/lib/session'
import { PageHeader } from '@/components/crm/page-header'
import { DeleteRowButton } from '@/components/crm/delete-row-button'
import { getDepartments } from '@/services/org-structure.service'
import { getOrgUserOptions } from '@/services/user.service'
import { DepartmentForm } from './department-form'
import { deleteDepartmentAction } from './actions'
import { isOk } from '@/lib/result'

export const metadata = { title: 'Departments | Kawman ExAct Admin' }

export default async function AdminDepartmentsPage() {
  await requirePermission('organizations.view')

  const [departments, managersResult] = await Promise.all([getDepartments(), getOrgUserOptions()])
  const managers = isOk(managersResult) ? managersResult.data : []

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader title="Departments" subtitle={`${departments.length} departments`} />
        <DepartmentForm managers={managers} />

        <div className="rounded-xl border border-white/[0.08] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.03] text-white/50 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Manager</th>
                <th className="px-4 py-3 font-medium">Users</th>
                <th className="px-4 py-3 font-medium">Teams</th>
                <th className="px-4 py-3 font-medium w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {departments.map((d) => (
                <tr key={d.id} className="hover:bg-white/[0.02]">
                  <td className="px-4 py-3">
                    <p className="text-white">{d.name}</p>
                    {d.description && <p className="text-xs text-white/40">{d.description}</p>}
                  </td>
                  <td className="px-4 py-3 text-white/60">{d.manager ?? '—'}</td>
                  <td className="px-4 py-3 text-white/60">{d.userCount}</td>
                  <td className="px-4 py-3 text-white/60">{d.teamCount}</td>
                  <td className="px-4 py-3">
                    <DeleteRowButton
                      action={deleteDepartmentAction.bind(null, d.id)}
                      confirmLabel={`Delete ${d.name}? Users keep their accounts but lose this department.`}
                    />
                  </td>
                </tr>
              ))}
              {departments.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-white/40">
                    No departments yet.
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
