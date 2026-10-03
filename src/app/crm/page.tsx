import Link from 'next/link'
import { Users, Building2, User, Handshake, TrendingUp, DollarSign } from 'lucide-react'
import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { Card } from '@/components/ui/card'
import { PipelineCard } from '@/components/dashboard/pipeline-card'
import { LeadSourceChart } from '@/components/dashboard/lead-source-chart'
import { DashboardGate } from '@/components/dashboard/dashboard-gate'
import { ExportMenu } from '@/components/report-engine/export-menu'
import { buildCrmDashboardReport } from '@/lib/report-engine/builders/crm-dashboard'
import { getCrmDashboardData } from '@/services/crm-reports.service'
import { formatCurrency } from '@/lib/utils'
import { getSession } from '@/lib/session'

export const metadata = { title: 'CRM Dashboard | Kawman ExAct' }

export default async function CrmDashboardPage() {
  const session = await getSession()
  const hasDashboardAccess = ((session?.user.permissions as string[] | undefined) ?? []).includes('dashboard.view')
  if (!hasDashboardAccess) {
    return (
      <MainLayout>
        <div className="space-y-6 animate-in">
          <DashboardGate />
        </div>
      </MainLayout>
    )
  }

  const data = await getCrmDashboardData()
  const sessionUser = session?.user as unknown as { name?: string; email?: string; organization?: { name?: string } | null } | undefined
  const exportReport = buildCrmDashboardReport({
    data,
    generatedBy: sessionUser?.name ?? sessionUser?.email,
    organizationName: sessionUser?.organization?.name ?? undefined,
  })

  const stats = [
    { label: 'Leads', value: data.totals.leads, icon: Users, href: '/leads', color: 'text-purple-400 bg-purple-500/15' },
    { label: 'Companies', value: data.totals.companies, icon: Building2, href: '/companies', color: 'text-blue-400 bg-blue-500/15' },
    { label: 'Contacts', value: data.totals.contacts, icon: User, href: '/contacts', color: 'text-emerald-400 bg-emerald-500/15' },
    { label: 'Open Deals', value: data.totals.openDeals, icon: Handshake, href: '/deals', color: 'text-orange-400 bg-orange-500/15' },
  ]

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader
          title="CRM Dashboard"
          subtitle="A single view across your leads, companies, contacts, and pipeline"
          action={<ExportMenu report={exportReport} />}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((s) => (
            <Link key={s.label} href={s.href}>
              <Card className="p-5 bg-[#0a111c]/80 border-white/[0.08] hover:border-white/[0.15] transition-colors">
                <div className={`h-11 w-11 rounded-xl flex items-center justify-center ${s.color}`}>
                  <s.icon className="h-5 w-5" />
                </div>
                <p className="text-sm text-white/60 mt-3">{s.label}</p>
                <p className="text-2xl font-bold text-white mt-0.5">{s.value}</p>
              </Card>
            </Link>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card className="p-5 bg-[#0a111c]/80 border-white/[0.08]">
            <div className="flex items-center gap-2 text-white/60 text-sm mb-1">
              <TrendingUp className="h-4 w-4" /> Win rate
            </div>
            <p className="text-2xl font-bold text-white">{data.winRate}</p>
          </Card>
          <Card className="p-5 bg-[#0a111c]/80 border-white/[0.08]">
            <div className="flex items-center gap-2 text-white/60 text-sm mb-1">
              <DollarSign className="h-4 w-4" /> Avg. won deal size
            </div>
            <p className="text-2xl font-bold text-white">{data.avgDealSize}</p>
          </Card>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <PipelineCard stages={data.pipeline} conversionRate={data.winRate} conversionTrend="" />
          <LeadSourceChart sources={data.leadSources} total={data.totalLeads} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <Card className="p-4 bg-[#0a111c]/80 border-white/[0.08]">
            <h3 className="text-sm font-medium text-white mb-3">Top companies by deal value</h3>
            {data.topCompanies.length === 0 && <p className="text-sm text-white/40">No deals yet.</p>}
            <ul className="space-y-2">
              {data.topCompanies.map((c) => (
                <li key={c.id} className="flex items-center justify-between text-sm">
                  <Link href={`/companies/${c.id}`} className="text-white/70 hover:text-purple-300 truncate pr-2">
                    {c.name}
                  </Link>
                  <span className="text-white/40 shrink-0">
                    {c.dealCount} deal{c.dealCount === 1 ? '' : 's'} · {formatCurrency(c.dealValue)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-4 bg-[#0a111c]/80 border-white/[0.08]">
            <h3 className="text-sm font-medium text-white mb-3">Biggest open deals</h3>
            {data.topDeals.length === 0 && <p className="text-sm text-white/40">No open deals.</p>}
            <ul className="space-y-2">
              {data.topDeals.map((d) => (
                <li key={d.id} className="flex items-center justify-between text-sm">
                  <Link href={`/deals/${d.id}`} className="text-white/70 hover:text-purple-300 truncate pr-2">
                    {d.name} <span className="text-white/40">· {d.company}</span>
                  </Link>
                  <span className="text-white/40 shrink-0">{formatCurrency(d.value)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </MainLayout>
  )
}
