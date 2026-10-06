'use client'

import * as React from 'react'
import { usePathname, useRouter } from 'next/navigation'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Boxes, ChevronDown, ChevronRight, IndianRupee, Percent, TrendingUp, Wallet } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type {
  ProductSalesByEmployeeResult,
  ProductSalesByEmployeeRow,
} from '@/services/crm-reports.service'
import { cn, formatCurrency, formatNumber } from '@/lib/utils'

/**
 * Read-only view for the Product Sales by Employee report.
 *
 * The server component has already applied org scope, record scope and the
 * date window; this component only presents the result and owns the two pieces
 * of interaction state: the URL-backed date range and which employee rows are
 * expanded.
 *
 * `canViewCost` is computed server-side from `reports.view_all`. A user without
 * it never receives cost / profit / margin in the payload shape used here, and
 * the columns and KPI cards are omitted entirely rather than shown as zero.
 */

interface ProductSalesByEmployeeViewProps {
  data: ProductSalesByEmployeeResult
  /** Holders of `reports.view_all` see cost, profit and margin. */
  canViewCost: boolean
  /** Resolved window, as YYYY-MM-DD — echoed back into the date inputs. */
  from: string
  to: string
}

/** How many employees the chart shows before it stops being readable. */
const CHART_EMPLOYEE_LIMIT = 12

function pct(value: number | null): string {
  return value === null ? '—' : `${(value * 100).toFixed(1)}%`
}

export function ProductSalesByEmployeeView({
  data,
  canViewCost,
  from,
  to,
}: ProductSalesByEmployeeViewProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [, startTransition] = React.useTransition()

  const [fromInput, setFromInput] = React.useState(from)
  const [toInput, setToInput] = React.useState(to)
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set())

  // Keep the inputs in step when the URL changes underneath us (Back button, or
  // a cleared filter). This is React's documented "adjust state during render"
  // pattern rather than an effect, so it costs no extra render pass and does
  // not clobber an input the user is mid-way through typing.
  const [syncedWindow, setSyncedWindow] = React.useState({ from, to })
  if (syncedWindow.from !== from || syncedWindow.to !== to) {
    setSyncedWindow({ from, to })
    setFromInput(from)
    setToInput(to)
  }

  const rowsByOwner = React.useMemo(() => {
    const map = new Map<string, ProductSalesByEmployeeRow[]>()
    for (const row of data.rows) {
      const list = map.get(row.ownerId) ?? []
      list.push(row)
      map.set(row.ownerId, list)
    }
    return map
  }, [data.rows])

  // The date range lives in the URL so the range is shareable, the back button
  // works, and the server component re-queries rather than filtering in the
  // browser. `from`/`to` are the only params this route supports.
  const pushRange = React.useCallback(
    (nextFrom: string, nextTo: string) => {
      const next = new URLSearchParams()
      if (nextFrom) next.set('from', nextFrom)
      if (nextTo) next.set('to', nextTo)
      const qs = next.toString()
      startTransition(() => {
        router.push(qs ? `${pathname}?${qs}` : pathname)
      })
    },
    [pathname, router]
  )

  const applyRange = React.useCallback(() => {
    pushRange(fromInput, toInput)
  }, [pushRange, fromInput, toInput])

  const clearRange = React.useCallback(() => {
    setFromInput('')
    setToInput('')
    pushRange('', '')
  }, [pushRange])

  const toggle = React.useCallback((ownerId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(ownerId)) next.delete(ownerId)
      else next.add(ownerId)
      return next
    })
  }, [])

  const chartData = React.useMemo(
    () =>
      data.employeeTotals.slice(0, CHART_EMPLOYEE_LIMIT).map((row) => ({
        name: row.ownerName,
        revenue: row.revenue,
        ...(canViewCost ? { cost: row.cost } : {}),
      })),
    [data.employeeTotals, canViewCost]
  )

  const g = data.grandTotal
  const statCards = [
    { label: 'Units sold', value: formatNumber(g.quantity), icon: Boxes, tone: 'text-white' },
    { label: 'Revenue', value: formatCurrency(g.revenue), icon: IndianRupee, tone: 'text-white' },
  ]
  const costCards = [
    { label: 'Cost', value: formatCurrency(g.cost), icon: Wallet, tone: 'text-white' },
    {
      label: 'Profit',
      value: formatCurrency(g.profit),
      icon: TrendingUp,
      tone: g.profit < 0 ? 'text-red-400' : 'text-emerald-400',
    },
    { label: 'Margin', value: pct(g.margin), icon: Percent, tone: 'text-white' },
  ]
  const stats = canViewCost ? [...statCards, ...costCards] : statCards

  const isEmpty = data.rows.length === 0

  return (
    <div className="space-y-6">
      <Card className="bg-[#0a111c]/80 border-white/[0.08]">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs text-white/50">
              From
              <input
                type="date"
                value={fromInput}
                max={toInput || undefined}
                onChange={(e) => setFromInput(e.target.value)}
                className="mt-1 block rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white"
              />
            </label>
            <label className="text-xs text-white/50">
              To
              <input
                type="date"
                value={toInput}
                min={fromInput || undefined}
                onChange={(e) => setToInput(e.target.value)}
                className="mt-1 block rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white"
              />
            </label>
            <Button onClick={applyRange} size="sm" variant="secondary" className="gap-1.5">
              Apply
            </Button>
            <button
              type="button"
              onClick={clearRange}
              className="text-xs text-white/40 underline hover:text-white"
            >
              Clear
            </button>
            <span className="ml-auto text-xs text-white/35">
              Won deals only · closed {from} → {to}
            </span>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {stats.map((s) => (
          <Card key={s.label} className="p-5 bg-[#0a111c]/80 border-white/[0.08]">
            <div className="h-11 w-11 rounded-xl flex items-center justify-center bg-purple-500/15 text-purple-400">
              <s.icon className="h-5 w-5" />
            </div>
            <p className="text-sm text-white/60 mt-3">{s.label}</p>
            <p className={cn('text-2xl font-bold mt-0.5', s.tone)}>{s.value}</p>
          </Card>
        ))}
      </div>

      {isEmpty ? (
        <Card className="bg-[#0a111c]/80 border-white/[0.08]">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">No line items in this period</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-white/50">
            <p>
              This report is built from deal line items, so it needs at least one won deal with
              products attached.
            </p>
            <p>
              Open a deal, add products on its line items tab, then move it to{' '}
              <span className="text-white/70">Won</span> with a close date inside the selected range.
              Deals with no line items contribute nothing here — their value still shows on the{' '}
              <a href="/reports/sales" className="text-purple-300 underline">Sales Reports</a> page.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="bg-[#0a111c]/80 border-white/[0.08]">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">Revenue vs Cost by Employee</CardTitle>
              <p className="text-xs text-white/45">
                Top {Math.min(CHART_EMPLOYEE_LIMIT, data.employeeTotals.length)} of{' '}
                {data.employeeTotals.length} by revenue
              </p>
            </CardHeader>
            <CardContent>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                    <XAxis
                      dataKey="name"
                      stroke="rgba(255,255,255,0.35)"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                      interval={0}
                      angle={-20}
                      textAnchor="end"
                      height={56}
                    />
                    <YAxis
                      stroke="rgba(255,255,255,0.35)"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v: number) => (v >= 1000 ? `₹${Math.round(v / 1000)}k` : `₹${v}`)}
                    />
                    <Tooltip
                      contentStyle={{
                        background: '#0a111c',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 8,
                      }}
                      labelStyle={{ color: '#fff' }}
                      formatter={(v) => formatCurrency(Number(v))}
                    />
                    <Legend wrapperStyle={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }} />
                    <Bar dataKey="revenue" name="Revenue" fill="#22c55e" radius={[4, 4, 0, 0]} />
                    {canViewCost && (
                      <Bar dataKey="cost" name="Cost" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                    )}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="p-4 bg-[#0a111c]/80 border-white/[0.08]">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-white">
                Employee product breakdown
              </h3>
              <span className="text-xs text-white/35">Click a row to expand its products</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-white/40 text-xs uppercase tracking-wide border-b border-white/[0.06]">
                    <th className="py-2 pr-2 font-medium">Employee</th>
                    <th className="py-2 px-2 font-medium text-right">Units</th>
                    <th className="py-2 px-2 font-medium text-right">Revenue</th>
                    {canViewCost && <th className="py-2 px-2 font-medium text-right">Cost</th>}
                    {canViewCost && <th className="py-2 px-2 font-medium text-right">Profit</th>}
                    {canViewCost && <th className="py-2 px-2 font-medium text-right">Margin</th>}
                    <th className="py-2 pl-2 font-medium" aria-label="Expand" />
                  </tr>
                </thead>
                <tbody>
                  {data.employeeTotals.map((total) => {
                    const isExpanded = expanded.has(total.ownerId)
                    const products = rowsByOwner.get(total.ownerId) ?? []
                    return (
                      <React.Fragment key={total.ownerId}>
                        <tr className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                          <td className="py-2 pr-2 text-white/85 font-medium">
                            <button
                              type="button"
                              onClick={() => toggle(total.ownerId)}
                              aria-expanded={isExpanded}
                              className="inline-flex items-center gap-1.5 text-left hover:text-purple-300"
                            >
                              {isExpanded ? (
                                <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                              ) : (
                                <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                              )}
                              {total.ownerName}
                            </button>
                          </td>
                          <td className="py-2 px-2 text-right text-white/60">
                            {formatNumber(total.quantity)}
                          </td>
                          <td className="py-2 px-2 text-right text-white font-medium">
                            {formatCurrency(total.revenue)}
                          </td>
                          {canViewCost && (
                            <td className="py-2 px-2 text-right text-white/60">
                              {formatCurrency(total.cost)}
                            </td>
                          )}
                          {canViewCost && (
                            <td
                              className={cn(
                                'py-2 px-2 text-right font-medium',
                                total.profit < 0 ? 'text-red-400' : 'text-emerald-400'
                              )}
                            >
                              {formatCurrency(total.profit)}
                            </td>
                          )}
                          {canViewCost && (
                            <td className="py-2 px-2 text-right text-white/60">{pct(total.margin)}</td>
                          )}
                          <td className="py-2 pl-2" />
                        </tr>
                        {isExpanded && (
                          <tr className="border-b border-white/[0.04] bg-white/[0.02]">
                            <td colSpan={canViewCost ? 7 : 4} className="px-2 py-2">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-left text-white/35 uppercase tracking-wide">
                                    <th className="py-1 pr-2 font-medium">Product</th>
                                    <th className="py-1 px-2 font-medium text-right">Units</th>
                                    <th className="py-1 px-2 font-medium text-right">Revenue</th>
                                    {canViewCost && (
                                      <th className="py-1 px-2 font-medium text-right">Cost</th>
                                    )}
                                    {canViewCost && (
                                      <th className="py-1 px-2 font-medium text-right">Profit</th>
                                    )}
                                    {canViewCost && (
                                      <th className="py-1 px-2 font-medium text-right">Margin</th>
                                    )}
                                  </tr>
                                </thead>
                                <tbody>
                                  {products.map((p) => (
                                    <tr key={`${p.ownerId}-${p.productId}`}>
                                      <td className="py-1 pr-2 text-white/75">{p.productName}</td>
                                      <td className="py-1 px-2 text-right text-white/55">
                                        {formatNumber(p.quantity)}
                                      </td>
                                      <td className="py-1 px-2 text-right text-white/80">
                                        {formatCurrency(p.revenue)}
                                      </td>
                                      {canViewCost && (
                                        <td className="py-1 px-2 text-right text-white/55">
                                          {formatCurrency(p.cost)}
                                        </td>
                                      )}
                                      {canViewCost && (
                                        <td
                                          className={cn(
                                            'py-1 px-2 text-right',
                                            p.profit < 0 ? 'text-red-400' : 'text-white/80'
                                          )}
                                        >
                                          {formatCurrency(p.profit)}
                                        </td>
                                      )}
                                      {canViewCost && (
                                        <td className="py-1 px-2 text-right text-white/55">
                                          {pct(p.margin)}
                                        </td>
                                      )}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-white/[0.08] text-white/80">
                    <td className="py-2 pr-2 font-semibold">All employees</td>
                    <td className="py-2 px-2 text-right font-semibold">{formatNumber(g.quantity)}</td>
                    <td className="py-2 px-2 text-right font-semibold">{formatCurrency(g.revenue)}</td>
                    {canViewCost && (
                      <td className="py-2 px-2 text-right font-semibold">{formatCurrency(g.cost)}</td>
                    )}
                    {canViewCost && (
                      <td className="py-2 px-2 text-right font-semibold">{formatCurrency(g.profit)}</td>
                    )}
                    {canViewCost && (
                      <td className="py-2 px-2 text-right font-semibold">{pct(g.margin)}</td>
                    )}
                    <td className="py-2 pl-2" />
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}