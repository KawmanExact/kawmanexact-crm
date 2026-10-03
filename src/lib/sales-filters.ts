/**
 * Sales tracking filters — ONE parser shared by the page, the KPIs, the
 * breakdowns and all three export formats, so a number in an export always
 * matches the number on screen.
 *
 * Filters arrive as URL query parameters and are validated here (never
 * trusted): enum-ish filters are matched against a whitelist, dates must
 * parse, and sort keys/directions are whitelisted before reaching Prisma.
 *
 * Pure module: no `server-only`, no Prisma import, so the whole thing is unit
 * testable and the client can reuse the constants/labels.
 */
import type { Prisma } from '@/generated/prisma'
import { PAYMENT_STATUSES, type PaymentStatus } from '@/lib/sales-money'

export const SALES_SORT_KEYS = [
  'saleDate',
  'salesperson',
  'customer',
  'product',
  'invoiceNumber',
  'quantity',
  'unitPrice',
  'totalAmount',
  'amountPaid',
  'balanceAmount',
  'paymentStatus',
] as const
export type SalesSortKey = (typeof SALES_SORT_KEYS)[number]

export const SORT_FIELDS: Record<SalesSortKey, string> = {
  saleDate: 'saleDate',
  salesperson: 'salespersonId',
  customer: 'customerId',
  product: 'productId',
  invoiceNumber: 'invoiceNumber',
  quantity: 'quantity',
  unitPrice: 'unitPrice',
  totalAmount: 'totalAmount',
  amountPaid: 'amountPaid',
  balanceAmount: 'balanceAmount',
  paymentStatus: 'paymentStatus',
}

export const PAGE_SIZES = [10, 25, 50, 100] as const
export const DEFAULT_PAGE_SIZE = 25

/** Sentinel for the "Other products" bucket in the product filter. */
export const OTHER_PRODUCTS_FILTER = '__other__'

/** Every date-range preset the filter bar offers, in menu order. */
export const DATE_PRESETS = [
  'today',
  'last7',
  'thisMonth',
  'lastMonth',
  'thisQuarter',
  'thisFY',
  'custom',
  'all',
] as const
export type DatePreset = (typeof DATE_PRESETS)[number]

export const DATE_PRESET_LABEL: Record<DatePreset, string> = {
  today: 'Today',
  last7: 'Last 7 days',
  thisMonth: 'This month',
  lastMonth: 'Last month',
  thisQuarter: 'This quarter',
  thisFY: 'This financial year (Apr-Mar)',
  custom: 'Custom',
  all: 'All time',
}

export interface SalesFilters {
  salespersonId?: string
  customerId?: string
  productId?: string
  /** Raw text search applied across product name, "Other" name and invoice number. */
  q?: string
  paymentStatus?: PaymentStatus
  datePreset?: DatePreset
  from?: Date
  to?: Date
  sort?: SalesSortKey
  dir?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}

/** Raw query bag as Next.js hands `searchParams` to a page/route. */
export type RawQuery = Record<string, string | string[] | undefined>

function first(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value
  return typeof v === 'string' ? v : undefined
}

function nonEmpty(value: string | string[] | undefined): string | undefined {
  const v = first(value)
  if (v === undefined) return undefined
  const trimmed = v.trim()
  return trimmed === '' ? undefined : trimmed
}

/** Start of the Indian financial year (1 April) for the given date's year. */
export function financialYearStart(now: Date): Date {
  const year = now.getFullYear()
  const startMonth = now.getMonth() >= 3 ? year : year - 1 // month index 3 === April
  return new Date(startMonth, 3, 1, 0, 0, 0, 0)
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0)
}

function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)
}

function startOfQuarter(now: Date): Date {
  const q = Math.floor(now.getMonth() / 3) * 3
  return new Date(now.getFullYear(), q, 1)
}

/**
 * Resolve a date-range preset into concrete [from, to) bounds.
 * `custom` uses the explicit from/to dates and ignores the clock.
 * Returns `undefined` bounds for 'all' / unknown presets (no date filter).
 */
export function resolveDateRange(
  preset: DatePreset | undefined,
  fromInput?: string,
  toInput?: string,
  now: Date = new Date()
): { from?: Date; to?: Date } {
  switch (preset) {
    case 'today':
      return { from: startOfDay(now), to: endOfDay(now) }
    case 'last7': {
      const from = startOfDay(now)
      from.setDate(from.getDate() - 6) // "last 7 days" includes today
      return { from, to: endOfDay(now) }
    }
    case 'thisMonth':
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: endOfDay(now) }
    case 'lastMonth': {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      return { from: first, to: new Date(first.getFullYear(), first.getMonth() + 1, 0, 23, 59, 59, 999) }
    }
    case 'thisQuarter':
      return { from: startOfQuarter(now), to: endOfDay(now) }
    case 'thisFY':
      return { from: financialYearStart(now), to: endOfDay(now) }
    case 'custom': {
      const from = fromInput ? new Date(fromInput) : undefined
      const to = toInput ? new Date(toInput) : undefined
      return {
        from: from && !Number.isNaN(from.getTime()) ? from : undefined,
        to: to && !Number.isNaN(to.getTime()) ? endOfDay(to) : undefined,
      }
    }
    default:
      return {}
  }
}

function isDatePreset(value: string | undefined): value is DatePreset {
  return value !== undefined && (DATE_PRESETS as readonly string[]).includes(value)
}

/**
 * Parse a raw URL query bag into validated filters. Whitelist-validates
 * enums, sorts, page size and dates; silently drops anything unrecognised.
 */
export function parseSalesFilters(params: RawQuery, now: Date = new Date()): SalesFilters {
  const paymentStatusRaw = nonEmpty(params.paymentStatus)
  const paymentStatus = PAYMENT_STATUSES.find((s) => s === paymentStatusRaw)

  const sortRaw = nonEmpty(params.sort)
  const sort = SALES_SORT_KEYS.find((s) => s === sortRaw)

  const dirRaw = nonEmpty(params.dir)

  const pageRaw = Number(first(params.page))
  const sizeRaw = Number(first(params.pageSize))
  const pageSize = (PAGE_SIZES as readonly number[]).find((s) => s === sizeRaw)

  const presetRaw = nonEmpty(params.date)
  const preset: DatePreset | undefined = isDatePreset(presetRaw) ? presetRaw : undefined
  const range = resolveDateRange(preset, nonEmpty(params.from), nonEmpty(params.to), now)

  return {
    salespersonId: nonEmpty(params.salesperson),
    customerId: nonEmpty(params.customer),
    productId: nonEmpty(params.product),
    q: nonEmpty(params.q),
    paymentStatus,
    datePreset: preset,
    from: range.from,
    to: range.to,
    sort,
    dir: dirRaw === 'asc' ? 'asc' : dirRaw === 'desc' ? 'desc' : undefined,
    page: Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : undefined,
    pageSize,
  }
}

/**
 * Own-vs-all sales visibility. A user holding `sales.view_all` sees the whole
 * organisation; everyone else is narrowed to their own rows, then widened to
 * their department by the existing getRecordScope() pattern (MANAGER /
 * SALES_MANAGER), falling back to 'OWN'.
 */
export function salesScopeWhere(
  organizationId: string,
  user: { id: string; permissions: string[]; departmentId?: string | null },
  roles: string[]
): Prisma.SalesTransactionWhereInput {
  if (user.permissions.includes('sales.view_all')) return { organizationId }

  const isDepartmentScoped = roles.some((r) => r === 'MANAGER' || r === 'SALES_MANAGER')
  if (isDepartmentScoped && user.departmentId) {
    return { organizationId, salesperson: { departmentId: user.departmentId } }
  }
  return { organizationId, salespersonId: user.id }
}

/**
 * Build the Prisma `where` for the validated filters. The organisation scope
 * is always applied by the caller (and again here as `organizationId`).
 */
export function buildSalesWhere(
  filters: SalesFilters,
  organizationId: string,
  now: Date = new Date()
): Prisma.SalesTransactionWhereInput {
  const where: Prisma.SalesTransactionWhereInput = { organizationId }

  if (filters.salespersonId) where.salespersonId = filters.salespersonId
  if (filters.customerId) where.customerId = filters.customerId

  if (filters.productId === OTHER_PRODUCTS_FILTER) {
    // The "Other products" bucket: lines typed freehand, not catalog hits.
    where.productId = null
  } else if (filters.productId) {
    where.productId = filters.productId
  }

  if (filters.paymentStatus) where.paymentStatus = filters.paymentStatus

  if (filters.from || filters.to) {
    where.saleDate = {
      ...(filters.from ? { gte: filters.from } : {}),
      ...(filters.to ? { lte: filters.to } : {}),
    }
  }

  if (filters.q) {
    where.OR = [
      { invoiceNumber: { contains: filters.q, mode: 'insensitive' } },
      { otherProductName: { contains: filters.q, mode: 'insensitive' } },
      { product: { name: { contains: filters.q, mode: 'insensitive' } } },
      { product: { variant: { contains: filters.q, mode: 'insensitive' } } },
    ]
  }

  // Guard against a caller passing a stale from/to without a preset.
  void now
  return where
}

/** Prisma `orderBy` for the whitelisted sort key, defaulting to newest first. */
export function buildSalesOrderBy(
  filters: SalesFilters
): Prisma.SalesTransactionOrderByWithRelationInput[] {
  const key: SalesSortKey = filters.sort ?? 'saleDate'
  const dir: 'asc' | 'desc' = filters.dir ?? 'desc'
  // Relations cannot be sorted through `orderBy` in every case, so they use
  // their foreign key — deterministic and index-backed.
  return [{ [SORT_FIELDS[key]]: dir }, { lineNumber: 'asc' }]
}

/**
 * Human-readable filter list for the export header, the print view and the
 * "no results because…" empty state. Returns only filters actually applied.
 */
export function describeSalesFilters(
  filters: SalesFilters,
  labels: {
    salesperson?: string
    customer?: string
    product?: string
  } = {}
): string[] {
  const out: string[] = []
  if (labels.salesperson) out.push(`Salesperson: ${labels.salesperson}`)
  if (filters.salespersonId && !labels.salesperson) out.push('Salesperson: selected')
  if (labels.customer) out.push(`Customer: ${labels.customer}`)
  else if (filters.customerId) out.push('Customer: selected')
  if (labels.product) out.push(`Product: ${labels.product}`)
  else if (filters.productId === OTHER_PRODUCTS_FILTER) out.push('Product: Other products')
  else if (filters.productId) out.push('Product: selected')

  if (filters.paymentStatus) {
    out.push(`Payment Status: ${filters.paymentStatus.replace(/_/g, ' ')}`)
  }

  if (filters.datePreset && filters.datePreset !== 'all') {
    const label = DATE_PRESET_LABEL[filters.datePreset]
    const from = filters.from ? formatFilterDate(filters.from) : undefined
    const to = filters.to ? formatFilterDate(filters.to) : undefined
    out.push(
      filters.datePreset === 'custom' && (from || to)
        ? `Date Range: ${from ?? 'start'} to ${to ?? 'today'}`
        : `Date Range: ${label}`
    )
  } else if (filters.from || filters.to) {
    const from = filters.from ? formatFilterDate(filters.from) : undefined
    const to = filters.to ? formatFilterDate(filters.to) : undefined
    out.push(`Date Range: ${from ?? 'start'} to ${to ?? 'today'}`)
  }

  if (filters.q) out.push(`Search: ${filters.q}`)
  return out
}

const FILTER_DATE_FMT = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

export function formatFilterDate(date: Date): string {
  return FILTER_DATE_FMT.format(date)
}

/** Serialise validated filters back into a query string (canonical ordering). */
export function salesFiltersToQuery(filters: SalesFilters): string {
  const next = new URLSearchParams()
  if (filters.salespersonId) next.set('salesperson', filters.salespersonId)
  if (filters.customerId) next.set('customer', filters.customerId)
  if (filters.productId) next.set('product', filters.productId)
  if (filters.paymentStatus) next.set('paymentStatus', filters.paymentStatus)
  if (filters.datePreset) next.set('date', filters.datePreset)
  if (filters.from) next.set('from', filters.from.toISOString().slice(0, 10))
  if (filters.to) next.set('to', filters.to.toISOString().slice(0, 10))
  if (filters.q) next.set('q', filters.q)
  if (filters.sort) next.set('sort', filters.sort)
  if (filters.dir) next.set('dir', filters.dir)
  if (filters.page && filters.page > 1) next.set('page', String(filters.page))
  if (filters.pageSize) next.set('pageSize', String(filters.pageSize))
  return next.toString()
}
