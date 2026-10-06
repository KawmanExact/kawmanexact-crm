'use client'

import { useState, useTransition, type ReactNode } from 'react'
import {
  FileText,
  Hash,
  Layers,
  Wallet,
  CheckCircle2,
  Clock,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/utils'
import type { ProductBreakdownRow, SalesKpis, SalesPageData, SalespersonBreakdownRow } from '@/types/sales'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Button } from '@/components/ui/button'
import { deleteSaleAction } from '@/app/sales-tracking/actions'
import { useRouter } from 'next/navigation'

/**
 * Headline KPIs. Quantity is deliberately reported PER UNIT when the filtered
 * rows mix units — one meaningless sum across kg and litres helps nobody, so
 * the card shows a breakdown instead.
 */
export function SalesKpiCards({ kpis, truncated }: { kpis: SalesKpis; truncated: boolean }) {
  const mixedUnits = kpis.quantityByUnit.length > 1

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
      <KpiCard
        icon={FileText}
        label="Total Sales"
        value={String(kpis.totalSales)}
        sublabel="distinct invoices"
      />
      <KpiCard
        icon={Hash}
        label="Transactions"
        value={String(kpis.transactionCount)}
        sublabel="product lines"
      />
      <KpiCard
        icon={Layers}
        label="Quantity Sold"
        value={
          kpis.totalQuantity === null
            ? '—'
            : `${formatNumber(kpis.totalQuantity)} ${kpis.totalQuantity === 0 ? '' : unitOf(kpis.quantityByUnit)}`.trim()
        }
        sublabel={
          mixedUnits
            ? kpis.quantityByUnit.map((q) => `${formatNumber(q.quantity)} ${q.unit}`).join(' · ')
            : `${formatNumber(kpis.totalQuantity ?? 0)} ${unitOf(kpis.quantityByUnit)}`
        }
        warning={mixedUnits ? 'mixed units' : undefined}
      />
      <KpiCard
        icon={Wallet}
        label="Total Sales Value"
        value={formatCurrency(kpis.totalSalesValue)}
        sublabel={`${kpis.totalProductsSold} distinct products`}
      />
      <KpiCard
        icon={CheckCircle2}
        label="Total Amount Paid"
        value={formatCurrency(kpis.totalAmountPaid)}
        sublabel="received to date"
      />
      <KpiCard
        icon={Clock}
        label="Total Pending"
        value={formatCurrency(kpis.totalPendingAmount)}
        sublabel="outstanding"
        tone={kpis.totalPendingAmount > 0 ? 'warning' : 'default'}
      />

      {truncated && (
        <p className="sm:col-span-2 xl:col-span-3 2xl:col-span-6 text-xs text-amber-300/80">
          Totals cover the first 50,000 matching lines. Narrow the filters for an exact figure.
        </p>
      )}
    </div>
  )
}

function unitOf(byUnit: Array<{ unit: string }>): string {
  return byUnit.length === 1 ? byUnit[0].unit : ''
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 }).format(value)
}

function KpiCard({
  icon: Icon,
  label,
  value,
  sublabel,
  tone = 'default',
  warning,
}: {
  icon: typeof FileText
  label: string
  value: string
  sublabel: string
  tone?: 'default' | 'warning'
  warning?: string
}) {
  return (
    <Card className="bg-[#0a111c]/80 border-white/[0.08] p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs uppercase tracking-wider text-white/40">{label}</span>
        <Icon className="h-4 w-4 shrink-0 text-white/30" />
      </div>
      <p
        className={`mt-2 text-xl font-semibold ${tone === 'warning' ? 'text-amber-300' : 'text-white'}`}
      >
        {value}
      </p>
      {/* The per-unit breakdown matters more than the headline, so it is shown
          even when a "mixed units" badge is present. */}
      <p className="mt-1 text-xs text-white/40">
        {warning && (
          <Badge variant="warning" className="mr-1.5 align-middle">
            {warning}
          </Badge>
        )}
        {sublabel}
      </p>
    </Card>
  )
}

function MiniStat({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: ReactNode
  tone?: 'default' | 'success' | 'warning'
}) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
      <p className="text-[11px] uppercase tracking-wider text-white/40">{label}</p>
      <p
        className={`mt-0.5 text-sm font-semibold ${
          tone === 'success'
            ? 'text-emerald-300/90'
            : tone === 'warning'
              ? 'text-amber-300/90'
              : 'text-white'
        }`}
      >
        {value}
      </p>
    </div>
  )
}

/** Renders a total only when the rows share one unit; otherwise per unit. */
function QuantityStat({ byUnit, fallback }: { byUnit: Array<{ unit: string; quantity: number }>; fallback: string }) {
  if (byUnit.length === 0) return <>{fallback}</>
  if (byUnit.length === 1) return <>{`${formatNumber(byUnit[0].quantity)} ${byUnit[0].unit}`}</>
  return <>{byUnit.map((q) => `${formatNumber(q.quantity)} ${q.unit}`).join(' · ')}</>
}

/** "<Name> - Sales Summary" shown when the salesperson filter is active. */
export function SalespersonSummary({
  summary,
}: {
  summary: NonNullable<SalesPageData['salespersonSummary']>
}) {
  return (
    <Card className="bg-[#0a111c]/80 border-white/[0.08] p-5 space-y-4">
      <div>
        <h2 className="text-base font-semibold text-white">{summary.salespersonName} &mdash; Sales Summary</h2>
        <p className="mt-0.5 text-xs text-white/40">
          {summary.totalProductsSold} distinct product{summary.totalProductsSold === 1 ? '' : 's'} sold
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <MiniStat label="Products Sold" value={String(summary.totalProductsSold)} />
        <MiniStat
          label="Quantity"
          value={
            summary.quantityByUnit.length > 0 ? (
              <QuantityStat byUnit={summary.quantityByUnit} fallback="0" />
            ) : (
              `${formatNumber(summary.totalQuantity ?? 0)} kg`
            )
          }
        />
        <MiniStat label="Sales Value" value={formatCurrency(summary.totalSalesValue)} />
        <MiniStat label="Paid" value={formatCurrency(summary.amountPaid)} tone="success" />
        <MiniStat label="Pending" value={formatCurrency(summary.pendingAmount)} tone="warning" />
      </div>

      <ProductBreakdownTable
        title="Product-wise breakdown"
        products={summary.products}
        emptyMessage="No sales recorded for this salesperson in the current filters."
      />
    </Card>
  )
}

/** Salesperson x product matrix for the no-salesperson-filtered case. */
export function SalespersonMatrix({ rows }: { rows: SalespersonBreakdownRow[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Expansion is derived from the CURRENT rows rather than reset in an effect:
  // a filter change that removes someone automatically makes them collapsed,
  // with no extra render pass.
  const present = new Set(rows.map((row) => row.salespersonId))

  if (rows.length === 0) return null

  return (
    <Card className="bg-[#0a111c]/80 border-white/[0.08] overflow-hidden">
      <div className="p-5 pb-3">
        <h2 className="text-base font-semibold text-white">Salesperson &times; Product</h2>
        <p className="mt-0.5 text-xs text-white/40">
          Which products each person sold, with quantity and value. Expand a row for the product
          breakdown.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-white/40 text-xs uppercase tracking-wide border-y border-white/[0.06]">
              <th className="px-4 py-2.5 font-medium">Salesperson</th>
              <th className="px-4 py-2.5 font-medium">Products</th>
              <th className="px-4 py-2.5 font-medium text-right">Quantity</th>
              <th className="px-4 py-2.5 font-medium text-right">Value</th>
              <th className="px-4 py-2.5 font-medium text-right">Paid</th>
              <th className="px-4 py-2.5 font-medium text-right">Pending</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isOpen = expanded.has(row.salespersonId) && present.has(row.salespersonId)
              return [
                <tr
                  key={row.salespersonId}
                  className="border-b border-white/[0.04] hover:bg-white/[0.03] transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-white">{row.salespersonName}</td>
                  <td className="px-4 py-3 text-white/60">{row.products.length}</td>
                  <td className="px-4 py-3 text-right text-white/70">
                    <QuantityStat byUnit={row.quantityByUnit} fallback={`0 ${row.unit}`} />
                  </td>
                  <td className="px-4 py-3 text-right text-white">{formatCurrency(row.totalSalesValue)}</td>
                  <td className="px-4 py-3 text-right text-emerald-300/90">
                    {formatCurrency(row.amountPaid)}
                  </td>
                  <td className="px-4 py-3 text-right text-amber-300/90">
                    {formatCurrency(row.pendingAmount)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-expanded={isOpen}
                      onClick={() => toggle(row.salespersonId)}
                    >
                      {isOpen ? 'Hide' : 'Details'}
                    </Button>
                  </td>
                </tr>,
                isOpen ? (
                  <tr
                    key={`${row.salespersonId}-detail`}
                    className="border-b border-white/[0.04] bg-white/[0.015]"
                  >
                    <td colSpan={7} className="px-4 py-3">
                      <ul className="space-y-1.5">
                        {row.products.map((product) => (
                          <li
                            key={product.key}
                            className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs"
                          >
                            <span className="min-w-[12rem] font-medium text-white/80">
                              {product.productName}
                            </span>
                            <span className="text-white/50">
                              {formatNumber(product.quantity)} {product.unit}
                            </span>
                            <span className="text-white">{formatCurrency(product.totalValue)}</span>
                            <span className="text-emerald-300/80">
                              {formatCurrency(product.amountPaid)} paid
                            </span>
                            <span className="text-amber-300/80">
                              {formatCurrency(product.pendingAmount)} pending
                            </span>
                            <span className="text-white/35">
                              {product.share}% of their sales
                            </span>
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                ) : null,
              ]
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

export function ProductBreakdownTable({
  title,
  products,
  emptyMessage,
}: {
  title: string
  products: ProductBreakdownRow[]
  emptyMessage: string
}) {
  return (
    <div>
      <h3 className="text-sm font-medium text-white/80">{title}</h3>
      {products.length === 0 ? (
        <p className="mt-2 text-xs text-white/40">{emptyMessage}</p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-white/40 text-xs uppercase tracking-wide border-b border-white/[0.06]">
                <th className="px-3 py-2 font-medium">Product</th>
                <th className="px-3 py-2 font-medium text-right">Quantity</th>
                <th className="px-3 py-2 font-medium text-right">Value</th>
                <th className="px-3 py-2 font-medium text-right">Paid</th>
                <th className="px-3 py-2 font-medium text-right">Pending</th>
                <th className="px-3 py-2 font-medium text-right">% of sales</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.key} className="border-b border-white/[0.04]">
                  <td className="px-3 py-2.5 text-white/80">
                    {product.productName}
                    {product.isOther && (
                      <Badge variant="neutral" className="ml-2 align-middle">
                        Other
                      </Badge>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right text-white/70">
                    {formatNumber(product.quantity)} {product.unit}
                  </td>
                  <td className="px-3 py-2.5 text-right text-white">{formatCurrency(product.totalValue)}</td>
                  <td className="px-3 py-2.5 text-right text-emerald-300/90">
                    {formatCurrency(product.amountPaid)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-amber-300/90">
                    {formatCurrency(product.pendingAmount)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-white/55">{product.share}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/** Delete one whole invoice, behind ConfirmDialog. */
export function DeleteSaleButton({ groupId, invoiceNumber }: { groupId: string; invoiceNumber: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function run() {
    setError(null)
    startTransition(async () => {
      const result = await deleteSaleAction(groupId)
      if (result.error) {
        setError(result.error)
        return
      }
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-red-400 hover:text-red-300"
        onClick={() => setOpen(true)}
      >
        Delete
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Delete invoice ${invoiceNumber}?`}
        description="Every product line on this invoice is removed. This cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        loading={pending}
        onConfirm={run}
      />
      {error && (
        <span role="alert" className="text-xs text-red-400">
          {error}
        </span>
      )}
    </div>
  )
}
