import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { Badge } from '@/components/ui/badge'
import { BarChart3, DollarSign, Users, Package } from 'lucide-react'
import { requireAnyPermission } from '@/lib/session'
import { getAIUsageSummary, AI_ANALYTICS_PERMISSIONS } from '@/services/ai-analytics.service'

export const metadata = { title: 'AI Analytics | Kawman ExAct Admin' }

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(amount)
}

export default async function AIAnalyticsPage() {
  // Per-person AI token counts and cost are admin-only. 'ai.use' is held by
  // every role including VIEWER, so it must not gate this page.
  await requireAnyPermission([...AI_ANALYTICS_PERMISSIONS])

  const summaryResult = await getAIUsageSummary()
  if (!summaryResult.success) {
    return (
      <MainLayout>
        <div className="space-y-6">
          <PageHeader title="AI Analytics" subtitle="Error loading analytics" />
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-300">
            {summaryResult.error}
          </div>
        </div>
      </MainLayout>
    )
  }

  const summary = summaryResult.data

  const statCards = [
    {
      label: 'Today',
      value: summary.today.requests,
      sub: `${formatCurrency(summary.today.cost)} cost`,
      icon: BarChart3,
    },
    {
      label: 'This Week',
      value: summary.thisWeek.requests,
      sub: `${formatCurrency(summary.thisWeek.cost)} cost`,
      icon: BarChart3,
    },
    {
      label: 'This Month',
      value: summary.thisMonth.requests,
      sub: `${formatCurrency(summary.thisMonth.cost)} cost`,
      icon: BarChart3,
    },
    {
      label: 'Total Cost (Top 10 models)',
      value: summary.topModels.reduce((s, m) => s + m.cost, 0),
      sub: `${summary.topModels.length} models`,
      icon: DollarSign,
      isCurrency: true,
    },
  ]

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader title="AI Analytics" subtitle="Usage and cost overview for AI features" />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((c) => (
            <div
              key={c.label}
              className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4"
            >
              <c.icon className="h-5 w-5 text-purple-400 mb-2" />
              <p className="text-2xl font-bold text-white">
                {c.isCurrency ? formatCurrency(c.value) : c.value}
              </p>
              <p className="text-sm text-white/50">{c.label}</p>
              <p className="text-xs text-white/40">{c.sub}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-5">
            <h3 className="text-sm font-medium text-white mb-4 flex items-center gap-2">
              <Package className="h-4 w-4 text-purple-400" />
              Top Models
            </h3>
            <div className="space-y-2">
              {summary.topModels.map((m) => (
                <div
                  key={m.model}
                  className="flex items-center justify-between"
                >
                  <span className="text-sm text-white/70">{m.model}</span>
                  <div className="flex items-center gap-3 text-right">
                    <span className="text-sm font-medium text-white">{m.requests} requests</span>
                    <span className="text-sm text-white/50 w-24">{formatCurrency(m.cost)}</span>
                  </div>
                </div>
              ))}
              {summary.topModels.length === 0 && (
                <p className="text-sm text-white/40">No model usage yet.</p>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-5">
            <h3 className="text-sm font-medium text-white mb-4 flex items-center gap-2">
              <Users className="h-4 w-4 text-purple-400" />
              Top Users
            </h3>
            <div className="space-y-2">
              {summary.topUsers.map((u) => (
                <div
                  key={u.userId}
                  className="flex items-center justify-between"
                >
                  <span className="text-sm text-white/70">{u.name}</span>
                  <div className="flex items-center gap-3 text-right">
                    <span className="text-sm font-medium text-white">{u.requests} requests</span>
                    <span className="text-sm text-white/50 w-24">{formatCurrency(u.cost)}</span>
                  </div>
                </div>
              ))}
              {summary.topUsers.length === 0 && (
                <p className="text-sm text-white/40">No user activity yet.</p>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-white/[0.06] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.03] text-white/50 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Period</th>
                <th className="px-4 py-3 font-medium">Requests</th>
                <th className="px-4 py-3 font-medium">Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              <tr className="hover:bg-white/[0.02]">
                <td className="px-4 py-3 text-white">Today</td>
                <td className="px-4 py-3 text-white/70">{summary.today.requests}</td>
                <td className="px-4 py-3 text-white/70">{formatCurrency(summary.today.cost)}</td>
              </tr>
              <tr className="hover:bg-white/[0.02]">
                <td className="px-4 py-3 text-white">This Week</td>
                <td className="px-4 py-3 text-white/70">{summary.thisWeek.requests}</td>
                <td className="px-4 py-3 text-white/70">{formatCurrency(summary.thisWeek.cost)}</td>
              </tr>
              <tr className="hover:bg-white/[0.02]">
                <td className="px-4 py-3 text-white">This Month</td>
                <td className="px-4 py-3 text-white/70">{summary.thisMonth.requests}</td>
                <td className="px-4 py-3 text-white/70">{formatCurrency(summary.thisMonth.cost)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="flex gap-4 text-xs">
          <Badge variant="neutral" className="text-white/60">
            <span className="w-2 h-2 rounded-full bg-purple-400 mr-1 inline-block" />
            Costs estimated using per-model token pricing
          </Badge>
        </div>
      </div>
    </MainLayout>
  )
}
