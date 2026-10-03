'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Search,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge, type BadgeVariant } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/utils'
import { PAYMENT_STATUS_LABEL } from '@/lib/sales-schema'
import type { PaymentStatus } from '@/lib/sales-money'
import {
  DATE_PRESETS,
  DATE_PRESET_LABEL,
  OTHER_PRODUCTS_FILTER,
  PAGE_SIZES,
  SALES_SORT_KEYS,
  type DatePreset,
  type SalesSortKey,
} from '@/lib/sales-filters'
import type { ProductOption, SalesPageData } from '@/types/sales'
import { productOptionLabel } from '@/types/sales'
import { DeleteSaleButton } from '@/components/crm/sales-kpi-cards'
import { SalesExportMenu } from '@/components/crm/sales-export-menu'

const STATUS_VARIANT: Record<PaymentStatus, BadgeVariant> = {
  PAID: 'success',
  PARTIALLY_PAID: 'warning',
  PENDING: 'danger',
}

const STATUS_FILTER_VALUE = {
  PAID: 'PAID',
  PARTIALLY_PAID: 'PARTIALLY_PAID',
  PENDING: 'PENDING',
} as const

export interface SalesFilterOptions {
  salespeople: Array<{ id: string; name: string }>
  customers: Array<{ id: string; name: string }>
  products: ProductOption[]
}

/**
 * Sales tracking table + filter bar.
 *
 * Every filter lives in the URL query string and is applied server-side, so
 * the KPIs, the breakdowns, the table and all three exports are always computed
 * from the same parsed filter set (see lib/sales-filters.ts).
 */
export function SalesTrackingView({
  data,
  options,
  canEdit,
  canDelete,
  canExport,
  canPickSalesperson,
}: {
  data: SalesPageData
  options: SalesFilterOptions
  canEdit: boolean
  canDelete: boolean
  canExport: boolean
  canPickSalesperson: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  const [query, setQuery] = useState(searchParams.get('q') ?? '')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const sortParam = searchParams.get('sort') as SalesSortKey | null
  const sortKey: SalesSortKey = sortParam && (SALES_SORT_KEYS as readonly string[]).includes(sortParam)
    ? sortParam
    : 'saleDate'
  const sortDir: 'asc' | 'desc' = searchParams.get('dir') === 'asc' ? 'asc' : 'desc'

  const dateParam = searchParams.get('date') as DatePreset | null
  const datePreset: DatePreset = dateParam && (DATE_PRESETS as readonly string[]).includes(dateParam)
    ? dateParam
    : 'all'

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === '') next.delete(key)
        else next.set(key, value)
      }
      // Any filter / sort / search change resets pagination.
      if (!('page' in updates)) next.delete('page')
      startTransition(() => {
        router.push(`${pathname}?${next.toString()}`)
      })
    },
    [pathname, router, searchParams]
  )

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      if (query !== (searchParams.get('q') ?? '')) updateParams({ q: query || null })
    }, 350)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  function toggleSort(key: SalesSortKey) {
    if (key === sortKey) updateParams({ sort: key, dir: sortDir === 'asc' ? 'desc' : 'asc' })
    else updateParams({ sort: key, dir: key === 'saleDate' || key === 'invoiceNumber' ? 'desc' : 'asc' })
  }

  const productFilter = searchParams.get('product') ?? ''
  const salespersonFilter = searchParams.get('salesperson') ?? ''
  const customerFilter = searchParams.get('customer') ?? ''
  const statusFilter = searchParams.get('paymentStatus') ?? ''
  const hasFilters = Boolean(
    searchParams.get('q')?.trim() || productFilter || salespersonFilter || customerFilter || statusFilter || datePreset !== 'all'
  )

  const { rows, total, page, pageCount } = data
  const rangeStart = total === 0 ? 0 : (page - 1) * data.pageSize + 1
  const rangeEnd = Math.min(page * data.pageSize, total)

  return (
    <>
      <Card className="bg-[#0a111c]/80 border-white/[0.08] p-4 print:hidden">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/35" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search invoice number, product..."
                aria-label="Search sales"
                className="pl-9"
              />
            </div>

            <select
              value={salespersonFilter}
              onChange={(event) => updateParams({ salesperson: event.target.value || null })}
              aria-label="Filter by salesperson"
              disabled={!canPickSalesperson && !salespersonFilter}
              className="h-9 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50 disabled:opacity-50"
            >
              <option value="">{canPickSalesperson ? 'All salespersons' : 'My sales only'}</option>
              {options.salespeople.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>

            <select
              value={customerFilter}
              onChange={(event) => updateParams({ customer: event.target.value || null })}
              aria-label="Filter by customer"
              className="h-9 max-w-[14rem] rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
            >
              <option value="">All customers</option>
              {options.customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>

            <select
              value={productFilter}
              onChange={(event) => updateParams({ product: event.target.value || null })}
              aria-label="Filter by product"
              className="h-9 max-w-[14rem] rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
            >
              <option value="">All products</option>
              {options.products.map((product) => (
                <option key={product.id} value={product.id}>
                  {productOptionLabel(product)}
                </option>
              ))}
              <option value={OTHER_PRODUCTS_FILTER}>Other products</option>
            </select>

            <select
              value={statusFilter}
              onChange={(event) => updateParams({ paymentStatus: event.target.value || null })}
              aria-label="Filter by payment status"
              className="h-9 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
            >
              <option value="">All payment statuses</option>
              {(Object.keys(STATUS_FILTER_VALUE) as PaymentStatus[]).map((status) => (
                <option key={status} value={status}>
                  {PAYMENT_STATUS_LABEL[status]}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <select
              value={datePreset}
              onChange={(event) => updateParams({ date: event.target.value, from: null, to: null })}
              aria-label="Date range preset"
              className="h-9 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
            >
              {DATE_PRESETS.map((preset) => (
                <option key={preset} value={preset}>
                  {DATE_PRESET_LABEL[preset]}
                </option>
              ))}
            </select>

            {datePreset === 'custom' && (
              <>
                <input
                  type="date"
                  defaultValue={searchParams.get('from') ?? ''}
                  onChange={(event) => updateParams({ from: event.target.value || null })}
                  aria-label="From date"
                  className="h-9 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                />
                <input
                  type="date"
                  defaultValue={searchParams.get('to') ?? ''}
                  onChange={(event) => updateParams({ to: event.target.value || null })}
                  aria-label="To date"
                  className="h-9 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                />
              </>
            )}

            <span className="text-xs text-white/35 sm:ml-auto">
              {total === 0 ? '0 sales lines' : `${rangeStart}–${rangeEnd} of ${total} sales lines`}
            </span>

            <select
              value={String(data.pageSize)}
              onChange={(event) => updateParams({ pageSize: event.target.value })}
              aria-label="Rows per page"
              className="h-9 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size} / page
                </option>
              ))}
            </select>

            {canExport && <SalesExportMenu />}
            <button
              type="button"
              onClick={() => window.print()}
              className="h-9 rounded-lg border border-white/[0.08] px-3 text-sm text-white/70 hover:bg-white/[0.05] transition-colors"
            >
              Print
            </button>
            <Link
              href="/sales-tracking?print=1"
              target="_blank"
              className="text-xs text-white/35 hover:text-white transition-colors underline underline-offset-4"
            >
              Print view
            </Link>
          </div>
        </div>
      </Card>

      <Card className="bg-[#0a111c]/80 border-white/[0.08]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-white/40 text-xs uppercase tracking-wide border-b border-white/[0.06]">
                <SortableHeader label="Date" sortKey="saleDate" activeKey={sortKey} dir={sortDir} onClick={toggleSort} sticky />
                <SortableHeader label="Salesperson" sortKey="salesperson" activeKey={sortKey} dir={sortDir} onClick={toggleSort} />
                <SortableHeader label="Customer" sortKey="customer" activeKey={sortKey} dir={sortDir} onClick={toggleSort} />
                <SortableHeader label="Product" sortKey="product" activeKey={sortKey} dir={sortDir} onClick={toggleSort} />
                <SortableHeader label="Invoice" sortKey="invoiceNumber" activeKey={sortKey} dir={sortDir} onClick={toggleSort} className="whitespace-nowrap" />
                <SortableHeader label="Quantity" sortKey="quantity" activeKey={sortKey} dir={sortDir} onClick={toggleSort} className="text-right" />
                <SortableHeader label="Unit Price" sortKey="unitPrice" activeKey={sortKey} dir={sortDir} onClick={toggleSort} className="text-right" />
                <SortableHeader label="Total" sortKey="totalAmount" activeKey={sortKey} dir={sortDir} onClick={toggleSort} className="text-right" />
                <SortableHeader label="Paid" sortKey="amountPaid" activeKey={sortKey} dir={sortDir} onClick={toggleSort} className="text-right" />
                <SortableHeader label="Balance" sortKey="balanceAmount" activeKey={sortKey} dir={sortDir} onClick={toggleSort} className="text-right" />
                <SortableHeader label="Status" sortKey="paymentStatus" activeKey={sortKey} dir={sortDir} onClick={toggleSort} />
                {(canEdit || canDelete) && (
                  <th scope="col" className="px-4 py-3 font-medium text-right print:hidden">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                // Only the first line of an invoice carries the row actions, so
                // deleting does not offer itself once per product line.
                const firstOfGroup = rows.findIndex((r) => r.groupId === row.groupId) === rows.indexOf(row)
                return (
                  <tr key={row.id} className="border-b border-white/[0.04] hover:bg-white/[0.03] transition-colors">
                    <td className="px-4 py-3 text-white/70 whitespace-nowrap sticky left-0 z-10 bg-[#0a111c]/95 backdrop-blur">
                      {row.saleDate.slice(0, 10)}
                    </td>
                    <td className="px-4 py-3 text-white/70 whitespace-nowrap">{row.salespersonName}</td>
                    <td className="px-4 py-3 text-white/70">{row.customerName}</td>
                    <td className="px-4 py-3">
                      <span className="text-white/80">{row.productName}</span>
                      {row.isOtherProduct && (
                        <Badge variant="neutral" className="ml-2 align-middle">
                          Other
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-white/60 whitespace-nowrap">
                      {row.invoiceNumber}
                      {row.lineNumber > 1 && (
                        <span className="ml-1 text-white/30">#{row.lineNumber}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-white/70 whitespace-nowrap">
                      {new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 }).format(row.quantity)} {row.unit}
                    </td>
                    <td className="px-4 py-3 text-right text-white/70 whitespace-nowrap">
                      {formatCurrency(row.unitPrice)}
                    </td>
                    <td className="px-4 py-3 text-right text-white font-medium whitespace-nowrap">
                      {formatCurrency(row.totalAmount)}
                    </td>
                    <td className="px-4 py-3 text-right text-emerald-300/90 whitespace-nowrap">
                      {formatCurrency(row.amountPaid)}
                    </td>
                    <td className="px-4 py-3 text-right text-amber-300/90 whitespace-nowrap">
                      {formatCurrency(row.balanceAmount)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_VARIANT[row.paymentStatus]}>
                        {PAYMENT_STATUS_LABEL[row.paymentStatus]}
                      </Badge>
                    </td>
                    {(canEdit || canDelete) && (
                      <td className="px-4 py-3 text-right whitespace-nowrap print:hidden">
                        {firstOfGroup && (
                          <div className="flex items-center justify-end gap-1">
                            {canEdit && (
                              <Link
                                href={`/sales-tracking/${row.groupId}/edit`}
                                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-white/60 hover:bg-white/[0.05] hover:text-white transition-colors"
                              >
                                <Pencil className="h-3 w-3" /> Edit
                              </Link>
                            )}
                            {canDelete && <DeleteSaleButton groupId={row.groupId} invoiceNumber={row.invoiceNumber} />}
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={canEdit || canDelete ? 12 : 11} className="px-4 py-10 text-center">
                    {hasFilters ? (
                      <span className="text-white/40">No sales match your filters.</span>
                    ) : (
                      <span className="flex flex-col items-center gap-3">
                        <span className="text-white/40">No sales recorded yet.</span>
                        <Link
                          href="/sales-tracking/new"
                          className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-500 transition-colors"
                        >
                          Record your first sale
                        </Link>
                      </span>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {pageCount > 1 && (
          <div className="flex items-center justify-between gap-3 p-4 border-t border-white/[0.06] print:hidden">
            <span className="text-xs text-white/40">
              Page {page} of {pageCount}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => updateParams({ page: String(page - 1) })}
                disabled={page <= 1}
                className="flex items-center gap-1 h-8 px-2.5 rounded-lg border border-white/[0.08] text-xs text-white/70 hover:bg-white/[0.05] disabled:opacity-30 disabled:pointer-events-none transition-colors"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Prev
              </button>
              <button
                type="button"
                onClick={() => updateParams({ page: String(page + 1) })}
                disabled={page >= pageCount}
                className="flex items-center gap-1 h-8 px-2.5 rounded-lg border border-white/[0.08] text-xs text-white/70 hover:bg-white/[0.05] disabled:opacity-30 disabled:pointer-events-none transition-colors"
              >
                Next <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </Card>
    </>
  )
}

/**
 * Renders the whole <th> so `aria-sort` lands on the header cell, which is
 * where the ARIA spec puts it — a <button> cannot carry it.
 */
function SortableHeader({
  label,
  sortKey,
  activeKey,
  dir,
  onClick,
  className = '',
  sticky = false,
}: {
  label: string
  sortKey: SalesSortKey
  activeKey: SalesSortKey
  dir: 'asc' | 'desc'
  onClick: (key: SalesSortKey) => void
  className?: string
  sticky?: boolean
}) {
  const isActive = sortKey === activeKey
  return (
    <th
      scope="col"
      aria-sort={isActive ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={`px-4 py-3 font-medium ${sticky ? 'sticky left-0 z-10 bg-[#0a111c]/95 backdrop-blur' : ''} ${className}`}
    >
      <button
        type="button"
        onClick={() => onClick(sortKey)}
        className="inline-flex items-center gap-1 font-medium hover:text-white transition-colors"
      >
        {label}
        <ArrowUpDown className={`h-3 w-3 ${isActive ? 'text-purple-400' : 'text-white/25'}`} />
      </button>
    </th>
  )
}
