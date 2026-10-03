import { notFound } from 'next/navigation'
import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { getEmployeeProfile } from '@/services/daily-report.service'
import { listEmployeeReports, type ReportSummary } from '@/services/ai.service'
import { isAIConfigured } from '@/lib/ai'
import { getInitials } from '@/lib/utils'
import { logAudit } from '@/lib/audit-log'
import { requireSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { EmployeeTabs } from './employee-tabs'
import { TeamDateFilter } from '../team-date-filter'

export const metadata = { title: 'Employee Profile | Kawman ExAct' }

function parseDateRange(sp: Record<string, string | string[] | undefined>) {
  const rawPreset = typeof sp.preset === 'string' ? sp.preset : undefined
  const rawFrom = typeof sp.from === 'string' ? sp.from : undefined
  const rawTo = typeof sp.to === 'string' ? sp.to : undefined
  if (rawPreset === 'today') {
    const d = new Date(); d.setHours(0,0,0,0)
    const to = new Date(d); to.setHours(23,59,59,999)
    return { from: d, to, preset: 'today' }
  }
  if (rawPreset === 'yesterday') {
    const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()-1)
    const to = new Date(d); to.setHours(23,59,59,999)
    return { from: d, to, preset: 'yesterday' }
  }
  if (rawPreset === 'week') {
    const to = new Date(); to.setHours(23,59,59,999)
    const from = new Date(); from.setHours(0,0,0,0); from.setDate(from.getDate()-6)
    return { from, to, preset: 'week' }
  }
  if (rawPreset === 'month') {
    const to = new Date(); to.setHours(23,59,59,999)
    const from = new Date(); from.setHours(0,0,0,0); from.setDate(1)
    return { from, to, preset: 'month' }
  }
  if (rawFrom || rawTo) return { from: rawFrom ? new Date(rawFrom) : undefined, to: rawTo ? new Date(rawTo) : undefined, preset: 'custom' }
  return { from: undefined, to: undefined, preset: 'week' as string }
}

export default async function EmployeeProfilePage({ params, searchParams }: { params: Promise<{ userId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireSession()

  const { userId } = await params
  const sp = await searchParams
  const { from, to, preset } = parseDateRange(sp)
  const isSelf = session.user.id === userId
  const canViewAll = (session.user.permissions as string[]).includes('team.view_all')
  if (!isSelf && !canViewAll) {
    // server-side gate (not just hidden UI) — only owner or admins can view others' profiles/reports
    throw new Error('Forbidden: missing team.view_all')
  }
  const user = await prisma.user.findFirst({ where: { id: userId, organizationId: session.user.organizationId }, select: { id: true, name: true } })
  if (!user) notFound()
  // Audit every cross-employee view by a manager/admin
  if (!isSelf) {
    await logAudit({
      organizationId: session.user.organizationId,
      actorId: session.user.id,
      action: 'ADMIN_CHANGES',
      resource: 'daily_report',
      resourceId: userId,
      metadata: { event: 'employee_profile_viewed', targetUserId: userId },
    }).catch(() => {})
  }
  const [profileResult, aiConfigured, employeeReports] = await Promise.all([
    getEmployeeProfile(userId, from && to ? { from, to } : undefined),
    Promise.resolve(isAIConfigured()),
    listEmployeeReports(userId).catch(() => [] as ReportSummary[]),
  ])

  if (!profileResult.success) {
    return (
      <MainLayout>
        <div className="space-y-6">
          <PageHeader title="Employee Profile" subtitle="Unable to load profile" />
          <Card className="p-5 bg-red-500/10 border-red-500/20">
            <p className="text-red-400">{profileResult.error}</p>
          </Card>
        </div>
      </MainLayout>
    )
  }

  const profile = profileResult.data

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader title={profile.user.name ?? 'Employee'} subtitle={profile.user.email} />

        <Card className="p-5 bg-[#0a111c]/80 border-white/[0.08]">
          <div className="flex flex-wrap gap-6 items-start">
            <div className="h-14 w-14 rounded-full bg-purple-500/20 text-purple-300 flex items-center justify-center text-lg font-semibold shrink-0">
              {getInitials(profile.user.name ?? profile.user.email)}
            </div>
            <div className="space-y-1">
              <p className="text-white font-medium">{profile.user.name ?? 'Unnamed'} <span className="text-white/40">· {profile.user.designation ?? 'No designation'}</span></p>
              <div className="flex flex-wrap gap-2">
                <Badge variant={profile.user.status === 'ACTIVE' ? 'success' : 'neutral'}>{profile.user.status}</Badge>
                {profile.user.department && <Badge variant="neutral">{profile.user.department}</Badge>}
                {profile.user.team && <Badge variant="neutral">{profile.user.team}</Badge>}
              </div>
              <p className="text-xs text-white/40">Last activity: {profile.user.lastLoginAt ? new Date(profile.user.lastLoginAt).toLocaleString('en-IN') : 'Never'} · Joined {new Date(profile.user.createdAt).toLocaleDateString('en-IN')}</p>
            </div>
            <div className="ml-auto grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <Stat label="Reports" value={profile.overview.totalReports} />
              <Stat label="Submitted" value={profile.overview.submittedReports} />
              <Stat label="Avg tasks" value={profile.overview.avgTasksCompleted} />
              <Stat label="Active min" value={profile.overview.avgActiveMinutes} />
            </div>
          </div>
        </Card>

        <TeamDateFilter preset={preset} from={from?.toISOString().slice(0,10)} to={to?.toISOString().slice(0,10)} />

        <EmployeeTabs profile={profile} aiConfigured={aiConfigured} employeeReports={employeeReports} />
      </div>
    </MainLayout>
  )
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] px-3 py-2"><p className="text-xs text-white/40">{label}</p><p className="text-white font-semibold">{value}</p></div>
}
