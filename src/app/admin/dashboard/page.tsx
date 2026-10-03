import Link from 'next/link'
import { Users, Building2, ShieldCheck, History } from 'lucide-react'
import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { DashboardGate } from '@/components/dashboard/dashboard-gate'
import { prisma } from '@/lib/db'
import { requirePermission } from '@/lib/session'
import { getSession } from '@/lib/session'
export const metadata = { title: 'Admin Dashboard | Kawman ExAct' }

export default async function AdminDashboardPage() {
  // Admin Dashboard is itself a dashboard — also gated to dashboard.view (Admin/Super Admin only)
  const sessionPerm = await getSession()
  const hasDashboardAccess = ((sessionPerm?.user.permissions as string[] | undefined) ?? []).includes('dashboard.view')
  if (!hasDashboardAccess) {
    return (
      <MainLayout>
        <div className="space-y-6 animate-in">
          <DashboardGate />
        </div>
      </MainLayout>
    )
  }
  const session = await requirePermission('organizations.view')
  const organizationId = session.user.organizationId

  const [userCount, deptCount, teamCount, roleBreakdown, recentLogs] = await Promise.all([
    prisma.user.count({ where: { organizationId } }),
    prisma.department.count({ where: { organizationId } }),
    prisma.team.count({ where: { organizationId } }),
    prisma.userRole.groupBy({
      by: ['roleId'],
      where: { user: { organizationId } },
      _count: { _all: true },
    }),
    prisma.auditLog.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { actor: { select: { name: true } } },
    }),
  ])

  const roleIds = roleBreakdown.map((r) => r.roleId)
  const roles = await prisma.role.findMany({ where: { id: { in: roleIds } } })
  const roleMap = new Map(roles.map((r) => [r.id, r.name]))

  const cards = [
    { label: 'Users', value: userCount, icon: Users, href: '/admin/users' },
    { label: 'Departments', value: deptCount, icon: Building2, href: '/admin/departments' },
    { label: 'Teams', value: teamCount, icon: ShieldCheck, href: '/admin/teams' },
    { label: 'Audit events', value: recentLogs.length, icon: History, href: '/admin/activity' },
  ]

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader title="Admin Dashboard" subtitle="Organization overview" />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {cards.map((c) => (
            <Link
              key={c.label}
              href={c.href}
              className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4 hover:border-purple-500/30 transition-colors"
            >
              <c.icon className="h-5 w-5 text-purple-400 mb-2" />
              <p className="text-2xl font-bold text-white">{c.value}</p>
              <p className="text-sm text-white/50">{c.label}</p>
            </Link>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-5">
            <h3 className="text-sm font-medium text-white mb-4">Users by role</h3>
            <div className="space-y-2">
              {roleBreakdown.map((r) => (
                <div key={r.roleId} className="flex items-center justify-between text-sm">
                  <span className="text-white/60">{(roleMap.get(r.roleId) ?? 'Unknown').replace(/_/g, ' ')}</span>
                  <span className="text-white font-medium">{r._count._all}</span>
                </div>
              ))}
              {roleBreakdown.length === 0 && <p className="text-sm text-white/40">No roles assigned yet.</p>}
            </div>
          </div>

          <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-5">
            <h3 className="text-sm font-medium text-white mb-4">Recent admin activity</h3>
            <div className="space-y-2">
              {recentLogs.map((log) => (
                <div key={log.id} className="text-sm text-white/60">
                  <span className="text-white">{log.actor?.name ?? 'Someone'}</span> — {log.action.replace(/_/g, ' ').toLowerCase()} on {log.resource}
                </div>
              ))}
              {recentLogs.length === 0 && <p className="text-sm text-white/40">No activity yet.</p>}
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  )
}
