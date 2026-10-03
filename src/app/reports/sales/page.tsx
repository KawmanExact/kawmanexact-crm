import { TrendingUp, DollarSign, Percent, Trophy } from 'lucide-react'
import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { Card } from '@/components/ui/card'
import { RevenueChart } from '@/components/reports/revenue-chart'
import { ExportMenu } from '@/components/report-engine/export-menu'
import { buildSalesReport } from '@/lib/report-engine/builders/sales'
import { getSalesReportData } from '@/services/crm-reports.service'
import { getSession } from '@/lib/session'
import { formatCurrency } from '@/lib/utils'

export const metadata = { title: 'Sales Reports | Kawman ExAct' }

export default async function SalesReportsPage() {
  const [data, session] = await Promise.all([getSalesReportData(), getSession()])
  const sessionUser = session?.user as unknown as { name?: string; email?: string; organization?: { name?: string } | null } | undefined
  const exportReport = buildSalesReport({
    data,
    generatedBy: sessionUser?.name ?? sessionUser?.email,
    organizationName: sessionUser?.organization?.name ?? undefined,
  })

  const stats = [
    { label: 'Total revenue won', value: data.totalWonValue, icon: DollarSign },
    { label: 'Win rate', value: data.winRate, icon: Percent },
    { label: 'Avg. deal size', value: data.avgDealSize, icon: TrendingUp },
    { label: 'Deals won', value: String(data.dealCount), icon: Trophy },
  ]

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader
          title="Sales Reports"
          subtitle="Revenue, win rate, and rep performance from your live pipeline"
          action={<ExportMenu report={exportReport} />}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((s) => (
            <Card key={s.label} className="p-5 bg-[#0a111c]/80 border-white/[0.08]">
              <div className="h-11 w-11 rounded-xl flex items-center justify-center bg-purple-500/15 text-purple-400">
                <s.icon className="h-5 w-5" />
              </div>
              <p className="text-sm text-white/60 mt-3">{s.label}</p>
              <p className="text-2xl font-bold text-white mt-0.5">{s.value}</p>
            </Card>
          ))}
        </div>

        <RevenueChart data={data.revenueByMonth} />

        <Card className="p-4 bg-[#0a111c]/80 border-white/[0.08]">
          <h3 className="text-sm font-medium text-white mb-3">Rep leaderboard (won deals)</h3>
          {data.ownerLeaderboard.length === 0 ? (
            <p className="text-sm text-white/40">No won deals yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-white/40 text-xs uppercase tracking-wide border-b border-white/[0.06]">
                  <th className="py-2 font-medium">Rep</th>
                  <th className="py-2 font-medium">Deals won</th>
                  <th className="py-2 font-medium">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {data.ownerLeaderboard.map((o) => (
                  <tr key={o.name} className="border-b border-white/[0.04]">
                    <td className="py-2 text-white/80">{o.name}</td>
                    <td className="py-2 text-white/60">{o.wonCount}</td>
                    <td className="py-2 text-white font-medium">{formatCurrency(o.wonValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </MainLayout>
  )
}
