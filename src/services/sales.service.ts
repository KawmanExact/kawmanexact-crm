/**
 * Sales Product Tracking — server-side aggregation and queries.
 *
 * Rules this service enforces:
 *  - Every query is scoped by `organizationId`, then narrowed to the rows the
 *    caller may see (sales.view_all -> whole org, department -> department via
 *    the existing getRecordScope pattern, otherwise OWN).
 *  - Every total is computed HERE from the stored Decimals. No total, balance
 *    or payment status ever comes from the client.
 */
import 'server-only'
import type { Prisma } from '@/generated/prisma'
import { Prisma as PrismaNS } from '@/generated/prisma'
import { prisma } from '@/lib/db'
import { requireApiSession } from '@/lib/session'
import type { Session } from '@/lib/auth'
import {
  buildSalesOrderBy,
  buildSalesWhere,
  describeSalesFilters,
  parseSalesFilters,
  salesScopeWhere,
  DEFAULT_PAGE_SIZE,
  type RawQuery,
  type SalesFilters,
} from '@/lib/sales-filters'
import {
  computeBalance,
  computeLineTotal,
  computeOutstandingAfterPdc,
  deriveLineMoneyDetail,
  derivePaymentStatus,
  toDecimalOrZero,
  toMoney,
  toQuantity,
  type LineMoney,
  type PaymentStatus,
} from '@/lib/sales-money'
import type {
  ProductBreakdownRow,
  SalesKpis,
  SalesPageData,
  SalesTransactionRow,
  SalespersonBreakdownRow,
} from '@/types/sales'
import { productOptionLabel } from '@/types/sales'
import { STANDARD_PRODUCTS } from '@/lib/products'

type SaleWithRelations = Prisma.SalesTransactionGetPayload<{
  include: {
    salesperson: { select: { id: true; name: true; email: true } }
    customer: { select: { id: true; name: true } }
    product: { select: { id: true; name: true; variant: true; unit: true } }
  }
}>

/** Cap on rows pulled for aggregation, so a huge export cannot exhaust memory. */
export const SALES_AGGREGATE_CAP = 50_000

function displayName(
  person: { name: string | null; email: string } | undefined,
  fallback = 'Unknown'
): string {
  if (!person) return fallback
  return person.name?.trim() || person.email || fallback
}

export function mapSaleRow(row: SaleWithRelations): SalesTransactionRow {
  const isStandardized = typeof row.productId === 'string' && row.productId.startsWith('std-')
  const otherName = row.otherProductName?.trim()
  const isOther = !row.productId && !isStandardized && !(otherName && STANDARD_PRODUCTS.includes(otherName as any))
  const productName = row.product
    ? productOptionLabel({ name: row.product.name, variant: row.product.variant })
    : isStandardized
      ? STANDARD_PRODUCTS[Number((row.productId as string).replace('std-', ''))] ?? (row.productId as string)
      : // `||`, not `??`: an empty-string otherProductName (the zod default)
        // must fall through to the label, never render as a blank product.
        (otherName || 'Other product')

  return {
    id: row.id,
    groupId: row.groupId,
    lineNumber: row.lineNumber,
    saleDate: row.saleDate.toISOString(),
    invoiceNumber: row.invoiceNumber,
    invoiceKey: row.invoiceKey,
    salespersonId: row.salespersonId,
    salespersonName: displayName(row.salesperson),
    customerId: row.customerId,
    customerName: row.customer?.name ?? 'Unknown',
    productId: row.productId,
    productName,
    otherProductName: row.otherProductName,
    isOtherProduct: isOther,
    // Unit resolution: the sale line's own stored unit first
    // (set for "Other" products), then the catalog product's
    // unit, then "kg" — the default unit of measure. The
    // literal string "unit" is never a valid fallback.
    unit: row.unit || row.product?.unit || 'kg',
    quantity: toQuantity(row.quantity).toNumber(),
    unitPrice: toMoney(row.unitPrice).toNumber(),
    totalAmount: toMoney(row.totalAmount).toNumber(),
    hsnCode: row.hsnCode,
    gstRate: toMoney(row.gstRate).toNumber(),
    gstAmount: toMoney(row.gstAmount).toNumber(),
    freightAmount: toMoney(row.freightAmount).toNumber(),
    invoiceAmount: toMoney(row.invoiceAmount).toNumber(),
    advanceAmount: toMoney(row.advanceAmount).toNumber(),
    pdcAmount: toMoney(row.pdcAmount).toNumber(),
    amountPaid: toMoney(row.amountPaid).toNumber(),
    balanceAmount: toMoney(row.balanceAmount).toNumber(),
    // Derived on read rather than stored: the uncovered figure is only ever
    // reported, never a column anyone filters on, so it would just be another
    // value that can go stale against balanceAmount.
    uncoveredAmount: computeOutstandingAfterPdc({
      balance: row.balanceAmount,
      pdcAmount: row.pdcAmount,
    }).toNumber(),
    paymentStatus: row.paymentStatus as PaymentStatus,
    paymentDate: row.paymentDate ? row.paymentDate.toISOString() : null,
    paymentMode: row.paymentMode,
    purchaseOrderNo: row.purchaseOrderNo,
    leadTimeDays: row.leadTimeDays,
    remarks: row.remarks,
  }
}

const SALE_INCLUDE = {
  salesperson: { select: { id: true, name: true, email: true } },
  customer: { select: { id: true, name: true } },
  product: { select: { id: true, name: true, variant: true, unit: true } },
} satisfies Prisma.SalesTransactionInclude

/**
 * Where clause = scope + filters. Exported so the export route and tests can
 * assert the exact same predicate the page used.
 */
export function salesWhereFor(
  filters: SalesFilters,
  user: Session['user'],
  roles: string[]
): Prisma.SalesTransactionWhereInput {
  return {
    ...salesScopeWhere(user.organizationId, {
      id: user.id,
      permissions: user.permissions as string[],
      departmentId: user.department?.id ?? null,
    }, roles),
    ...buildSalesWhere(filters, user.organizationId),
  }
}

function groupUnit(rows: SalesTransactionRow[]): {
  single: number | null
  byUnit: Array<{ unit: string; quantity: number }>
} {
  const totals = new Map<string, PrismaNS.Decimal>()
  for (const row of rows) {
    const current = totals.get(row.unit) ?? new PrismaNS.Decimal(0)
    totals.set(row.unit, current.plus(toDecimalOrZero(row.quantity)))
  }
  const byUnit = Array.from(totals.entries())
    .map(([unit, quantity]) => ({ unit, quantity: toQuantity(quantity).toNumber() }))
    .sort((a, b) => a.unit.localeCompare(b.unit))
  // A single meaningless sum across mixed units is worse than showing nothing,
  // so totalQuantity is null whenever more than one unit is present.
  return { single: byUnit.length === 1 ? byUnit[0].quantity : byUnit.length === 0 ? 0 : null, byUnit }
}

/**
 * Headline KPIs for the filtered set. Quantity is reported per unit when the
 * rows mix units rather than summed across incompatible units.
 */
export function computeSalesKpis(rows: SalesTransactionRow[]): SalesKpis {
  const invoices = new Set<string>()
  const products = new Set<string>()
  let taxableValue = new PrismaNS.Decimal(0)
  let gstValue = new PrismaNS.Decimal(0)
  let freightValue = new PrismaNS.Decimal(0)
  let invoiceValue = new PrismaNS.Decimal(0)
  let totalAmountPaid = new PrismaNS.Decimal(0)
  let advanceValue = new PrismaNS.Decimal(0)
  let pdcValue = new PrismaNS.Decimal(0)

  for (const row of rows) {
    invoices.add(row.groupId)
    products.add(row.productId ?? `other:${(row.otherProductName ?? '').toLowerCase()}`)
    taxableValue = taxableValue.plus(toDecimalOrZero(row.totalAmount))
    gstValue = gstValue.plus(toDecimalOrZero(row.gstAmount))
    freightValue = freightValue.plus(toDecimalOrZero(row.freightAmount))
    invoiceValue = invoiceValue.plus(toDecimalOrZero(row.invoiceAmount))
    totalAmountPaid = totalAmountPaid.plus(toDecimalOrZero(row.amountPaid))
    advanceValue = advanceValue.plus(toDecimalOrZero(row.advanceAmount))
    pdcValue = pdcValue.plus(toDecimalOrZero(row.pdcAmount))
  }

  const { single, byUnit } = groupUnit(rows)

  return {
    totalSales: invoices.size,
    transactionCount: rows.length,
    totalQuantity: single,
    quantityByUnit: byUnit,
    // Headline sales value is the INVOICE figure (taxable + GST + freight), so
    // it ties to the balance and pending figures. The pre-GST subtotal is kept
    // alongside it because the GST return is filed against taxable value, not
    // against the invoice total.
    totalSalesValue: toMoney(invoiceValue).toNumber(),
    totalAmountPaid: toMoney(totalAmountPaid).toNumber(),
    totalPendingAmount: toMoney(invoiceValue.minus(totalAmountPaid)).toNumber(),
    totalProductsSold: products.size,
    totalTaxableValue: toMoney(taxableValue).toNumber(),
    totalGstAmount: toMoney(gstValue).toNumber(),
    totalFreightAmount: toMoney(freightValue).toNumber(),
    totalAdvanceAmount: toMoney(advanceValue).toNumber(),
    totalPdcAmount: toMoney(pdcValue).toNumber(),
  }
}

/**
 * Product-wise breakdown with each product's share of the filtered sales value.
 * Typed "Other" products are grouped by their own normalised name.
 */
export function computeProductBreakdown(rows: SalesTransactionRow[]): ProductBreakdownRow[] {
  const groups = new Map<
    string,
    {
      productId: string | null
      productName: string
      isOther: boolean
      unit: string
      quantity: PrismaNS.Decimal
      totalValue: PrismaNS.Decimal
      taxableValue: PrismaNS.Decimal
      gstAmount: PrismaNS.Decimal
      amountPaid: PrismaNS.Decimal
      transactionCount: number
    }
  >()

  let grandTotal = new PrismaNS.Decimal(0)

  for (const row of rows) {
    // `||`, not `??`: a blank otherProductName falls back to the name
    // mapSaleRow already resolved (the typed name, or "Other product"),
    // so typed "Other" lines group by their name, never a blank bucket.
    const otherName = (row.otherProductName || row.productName).trim()
    const key = row.isOtherProduct
      ? `other:${otherName.toLowerCase()}`
      : (row.productId ?? otherName.toLowerCase())
    let group = groups.get(key)
    if (!group) {
      group = {
        productId: row.productId,
        productName: row.productName,
        isOther: row.isOtherProduct,
        unit: row.unit,
        quantity: new PrismaNS.Decimal(0),
        totalValue: new PrismaNS.Decimal(0),
        taxableValue: new PrismaNS.Decimal(0),
        gstAmount: new PrismaNS.Decimal(0),
        amountPaid: new PrismaNS.Decimal(0),
        transactionCount: 0,
      }
      groups.set(key, group)
    }
    group.quantity = group.quantity.plus(toDecimalOrZero(row.quantity))
    // Value and share are computed on the INVOICE amount so a product's pending
    // figure includes its GST and freight — otherwise the breakdown's pending
    // column would disagree with the KPI pending total.
    group.totalValue = group.totalValue.plus(toDecimalOrZero(row.invoiceAmount))
    group.taxableValue = group.taxableValue.plus(toDecimalOrZero(row.totalAmount))
    group.gstAmount = group.gstAmount.plus(toDecimalOrZero(row.gstAmount))
    group.amountPaid = group.amountPaid.plus(toDecimalOrZero(row.amountPaid))
    group.transactionCount += 1
    grandTotal = grandTotal.plus(toDecimalOrZero(row.invoiceAmount))
  }

  const total = toMoney(grandTotal)
  return Array.from(groups.entries())
    .map(([key, group]) => {
      const value = toMoney(group.totalValue)
      return {
        key,
        productId: group.productId,
        productName: group.productName,
        isOther: group.isOther,
        unit: group.unit,
        quantity: toQuantity(group.quantity).toNumber(),
        totalValue: value.toNumber(),
        taxableValue: toMoney(group.taxableValue).toNumber(),
        // Weighted-average unit price: the group's taxable
        // value over its quantity — what a unit of this
        // product actually sold for on average, before GST
        // and freight. Null when nothing was sold, so the
        // export shows an empty cell rather than #DIV/0!.
        avgUnitPrice: group.quantity.isZero()
          ? null
          : toMoney(group.taxableValue.dividedBy(group.quantity)).toNumber(),
        gstAmount: toMoney(group.gstAmount).toNumber(),
        amountPaid: toMoney(group.amountPaid).toNumber(),
        pendingAmount: toMoney(value.minus(group.amountPaid)).toNumber(),
        transactionCount: group.transactionCount,
        share:
          total.isZero() ? 0 : Math.round((value.dividedBy(total).times(100).toNumber() + Number.EPSILON) * 100) / 100,
      }
    })
    .sort((a, b) => b.totalValue - a.totalValue || a.productName.localeCompare(b.productName))
}

/**
 * Salesperson x product matrix: one entry per salesperson, each holding the
 * products they sold with quantity and value.
 */
export function computeSalespersonBreakdown(
  rows: SalesTransactionRow[]
): SalespersonBreakdownRow[] {
  const groups = new Map<string, SalesTransactionRow[]>()
  for (const row of rows) {
    const bucket = groups.get(row.salespersonId)
    if (bucket) bucket.push(row)
    else groups.set(row.salespersonId, [row])
  }

  return Array.from(groups.entries())
    .map(([salespersonId, sellerRows]) => {
      const name = sellerRows[0].salespersonName
      const { single, byUnit } = groupUnit(sellerRows)
      let totalSalesValue = new PrismaNS.Decimal(0)
      let amountPaid = new PrismaNS.Decimal(0)
      for (const row of sellerRows) {
        totalSalesValue = totalSalesValue.plus(toDecimalOrZero(row.invoiceAmount))
        amountPaid = amountPaid.plus(toDecimalOrZero(row.amountPaid))
      }
      const value = toMoney(totalSalesValue)
      return {
        salespersonId,
        salespersonName: name,
        unit: sellerRows[0].unit,
        totalQuantity: single,
        quantityByUnit: byUnit,
        totalSalesValue: value.toNumber(),
        amountPaid: toMoney(amountPaid).toNumber(),
        pendingAmount: toMoney(value.minus(amountPaid)).toNumber(),
        products: computeProductBreakdown(sellerRows),
      }
    })
    .sort((a, b) => b.totalSalesValue - a.totalSalesValue || a.salespersonName.localeCompare(b.salespersonName))
}

/**
 * Everything /sales-tracking needs for one render: the current page of rows plus
 * KPIs and breakdowns computed over the WHOLE filtered set (not just the page).
 */
export async function getSalesPage(
  rawParams: RawQuery,
  now: Date = new Date()
): Promise<SalesPageData> {
  const session = await requireApiSession()
  const user = session.user
  const roles = (user.roles ?? []) as string[]

  const filters = parseSalesFilters(rawParams, now)
  const where = salesWhereFor(filters, user, roles)
  const orderBy = buildSalesOrderBy(filters)
  const pageSize = filters.pageSize ?? DEFAULT_PAGE_SIZE
  const page = filters.page ?? 1

  // Salesperson filter dropdown: every active org user, or just the selected
  // one when the filter is narrowed (that person may be inactive by now).
  const peoplePromise =
    filters.salespersonId && filters.salespersonId !== user.id
      ? prisma.user.findMany({
          where: { organizationId: user.organizationId, id: filters.salespersonId },
          select: { id: true, name: true, email: true },
        })
      : prisma.user.findMany({
          where: { organizationId: user.organizationId, status: 'ACTIVE' },
          select: { id: true, name: true, email: true },
          orderBy: { name: 'asc' },
        })

  const [total, aggregate, pageRows, salespeople] = await Promise.all([
    prisma.salesTransaction.count({ where }),
    prisma.salesTransaction.findMany({
      where,
      orderBy,
      take: SALES_AGGREGATE_CAP,
      include: SALE_INCLUDE,
    }),
    prisma.salesTransaction.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: SALE_INCLUDE,
    }),
    peoplePromise,
  ])

  const allRows = aggregate.map(mapSaleRow)
  const rows = pageRows.map(mapSaleRow)
  const truncated = total > allRows.length
  const kpis = computeSalesKpis(allRows)
  const productBreakdown = computeProductBreakdown(allRows)
  const salespersonBreakdown = computeSalespersonBreakdown(allRows)

  let salespersonSummary: SalesPageData['salespersonSummary'] = null
  if (filters.salespersonId) {
    const entry = salespersonBreakdown.find((s) => s.salespersonId === filters.salespersonId)
    const name =
      entry?.salespersonName ??
      displayName(
        salespeople.find((s) => s.id === filters.salespersonId) as
          | { name: string | null; email: string }
          | undefined
      )
    salespersonSummary = {
      salespersonId: filters.salespersonId,
      salespersonName: name,
      totalProductsSold: entry ? new Set(entry.products.map((p) => p.key)).size : 0,
      totalQuantity: entry?.totalQuantity ?? 0,
      quantityByUnit: entry?.quantityByUnit ?? [],
      totalSalesValue: entry?.totalSalesValue ?? 0,
      amountPaid: entry?.amountPaid ?? 0,
      pendingAmount: entry?.pendingAmount ?? 0,
      products: entry?.products ?? [],
    }
  }

  const filterLabels = await resolveSalesFilterLabels(filters)

  return {
    rows,
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    kpis,
    productBreakdown,
    salespersonBreakdown,
    salespersonSummary,
    filters,
    filterLabels,
    truncated,
  }
}

/** Every filtered row (not just one page) — used by the exports. */
export async function getAllSalesRows(
  rawParams: RawQuery,
  now: Date = new Date()
): Promise<{ rows: SalesTransactionRow[]; total: number; filters: SalesFilters; truncated: boolean }> {
  const session = await requireApiSession()
  const user = session.user
  const roles = (user.roles ?? []) as string[]
  const filters = parseSalesFilters(rawParams, now)
  const where = salesWhereFor(filters, user, roles)

  const [total, rows] = await Promise.all([
    prisma.salesTransaction.count({ where }),
    prisma.salesTransaction.findMany({
      where,
      orderBy: buildSalesOrderBy(filters),
      take: SALES_AGGREGATE_CAP,
      include: SALE_INCLUDE,
    }),
  ])

  return { rows: rows.map(mapSaleRow), total, filters, truncated: total > rows.length }
}

/** Organisation name and the caller's display name — report headers. */
export async function getSalesExportMeta(): Promise<{ organizationName: string; generatedBy: string }> {
  const session = await requireApiSession()
  const org = await prisma.organization.findUnique({
    where: { id: session.user.organizationId },
    select: { name: true },
  })
  return { organizationName: org?.name ?? '', generatedBy: displayName(session.user) }
}

/**
 * Everything the three exports need, computed ONCE from one filtered row set so
 * the Excel, PDF and CSV files can never disagree with each other or with the
 * screen. Rows are capped at SALES_AGGREGATE_CAP; `truncated` tells the caller to
 * say so in the file rather than silently shipping partial totals.
 */
export async function getSalesExportData(
  rawParams: RawQuery,
  cap: number,
  now: Date = new Date()
): Promise<{
  rows: SalesTransactionRow[]
  total: number
  truncated: boolean
  filters: SalesFilters
  filterLines: string[]
  kpis: SalesKpis
  products: ProductBreakdownRow[]
  salespeople: SalespersonBreakdownRow[]
  organizationName: string
  generatedBy: string
}> {
  const session = await requireApiSession()
  const { rows, total, filters, truncated } = await getAllSalesRows(rawParams, now)
  // getAllSalesRows applies the 50k aggregate cap; re-read nothing, just honour
  // the caller's (smaller) format cap on top of it.
  const capped = rows.slice(0, cap)

  const [labels, org] = await Promise.all([
    resolveSalesFilterLabels(filters),
    prisma.organization.findUnique({
      where: { id: session.user.organizationId },
      select: { name: true },
    }),
  ])

  return {
    rows: capped,
    total,
    truncated: truncated || rows.length > capped.length,
    filters,
    filterLines: describeSalesFilters(filters, labels),
    kpis: computeSalesKpis(capped),
    products: computeProductBreakdown(capped),
    salespeople: computeSalespersonBreakdown(capped),
    organizationName: org?.name ?? '',
    generatedBy: displayName(session.user),
  }
}

/** One sale (all lines sharing a groupId) for the edit form. */
export async function getSaleGroup(groupId: string): Promise<SalesTransactionRow[]> {
  const session = await requireApiSession()
  const where = salesWhereFor({}, session.user, (session.user.roles ?? []) as string[])
  const rows = await prisma.salesTransaction.findMany({
    where: { ...where, groupId },
    orderBy: { lineNumber: 'asc' },
    include: SALE_INCLUDE,
  })
  return rows.map(mapSaleRow)
}

/**
 * The `where` a WRITE must use: organisation scope PLUS the caller's record
 * scope. A user with sales.update who is not sales.view_all must not be able to
 * rewrite or delete another salesperson's invoice just because they guessed its
 * groupId, so every mutating action resolves its target through this.
 */
export async function salesWriteWhere(groupId: string): Promise<Prisma.SalesTransactionWhereInput> {
  const session = await requireApiSession()
  return {
    ...salesScopeWhere(
      session.user.organizationId,
      {
        id: session.user.id,
        permissions: session.user.permissions as string[],
        departmentId: session.user.department?.id ?? null,
      },
      (session.user.roles ?? []) as string[]
    ),
    groupId,
  }
}

/** Distinct typed "Other" product names in use, with how often each appears. */
export async function getOtherProductNames(): Promise<Array<{ name: string; count: number }>> {
  const session = await requireApiSession()
  const where: Prisma.SalesTransactionWhereInput = {
    ...salesScopeWhere(session.user.organizationId, {
      id: session.user.id,
      permissions: session.user.permissions as string[],
      departmentId: session.user.department?.id ?? null,
    }, (session.user.roles ?? []) as string[]),
    productId: null,
    otherProductName: { not: null },
  }
  const rows = await prisma.salesTransaction.groupBy({
    by: ['otherProductName'],
    where,
    _count: { _all: true },
    orderBy: { otherProductName: 'asc' },
  })
  return rows
    .filter((r) => (r.otherProductName ?? '').trim() !== '')
    .map((r) => ({ name: (r.otherProductName ?? '').trim(), count: r._count._all }))
}

/** Active org users, for the salesperson picker and the export filter labels. */
export async function getSalespeople(): Promise<Array<{ id: string; name: string }>> {
  const session = await requireApiSession()
  const users = await prisma.user.findMany({
    where: { organizationId: session.user.organizationId, status: 'ACTIVE' },
    select: { id: true, name: true, email: true },
    orderBy: { name: 'asc' },
  })
  return users.map((u) => ({ id: u.id, name: displayName(u) }))
}

/** Resolve the display labels for the currently applied filters. */
export async function resolveSalesFilterLabels(
  filters: SalesFilters
): Promise<{ salesperson?: string; customer?: string; product?: string }> {
  const session = await requireApiSession()
  const [salesperson, customer, product] = await Promise.all([
    filters.salespersonId
      ? prisma.user.findFirst({
          where: { id: filters.salespersonId, organizationId: session.user.organizationId },
          select: { name: true, email: true },
        })
      : null,
    filters.customerId
      ? prisma.company.findFirst({
          where: { id: filters.customerId, organizationId: session.user.organizationId },
          select: { name: true },
        })
      : null,
    filters.productId && filters.productId !== '__other__'
      ? prisma.product.findFirst({
          where: { id: filters.productId, organizationId: session.user.organizationId },
          select: { name: true, variant: true },
        })
      : null,
  ])
  return {
    salesperson: salesperson ? displayName(salesperson) : undefined,
    customer: customer?.name,
    product: product ? productOptionLabel(product) : undefined,
  }
}

/**
 * Recompute every money column for a validated line. Called server-side on
 * save; the client sends only the raw inputs and never a total, balance or
 * payment status it worked out itself.
 *
 * Delegates to deriveLineMoneyDetail in lib/sales-money.ts — the same function
 * the browser form calls for its live totals — so the figure shown while typing,
 * the figure stored in Postgres, and the figure in every export are produced by
 * one piece of arithmetic and cannot drift apart.
 */
export function deriveLineMoney(input: {
  quantity: string | number
  unitPrice: string | number
  gstRate?: string | number
  freightAmount?: string | number
  advanceAmount?: string | number
  pdcAmount?: string | number
  amountPaid: string | number
}): LineMoney {
  return deriveLineMoneyDetail(input)
}
