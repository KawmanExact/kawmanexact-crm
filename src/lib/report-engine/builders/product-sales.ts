import type { UniversalReportDefinition, ReportMetric, ReportColumn } from '../types'
import type {
  ProductSalesByEmployeeResult,
  ProductSalesByEmployeeRow,
} from '@/services/crm-reports.service'
import { formatCurrency, formatNumber } from '@/lib/utils'

/**
 * "Product Sales by Employee" export.
 *
 * The engine renders exactly what the service returns — the service has
 * already applied org scope and record scope, so nothing here re-queries or
 * re-filters.
 *
 * `canViewCost` drives whether cost / profit / margin are exported at all.
 * Cost figures are commercially sensitive, so a user without
 * `reports.view_all` gets a revenue-only workbook rather than zeroes that read
 * like real numbers.
 */

export interface BuildProductSalesReportOptions {
  data: ProductSalesByEmployeeResult
  generatedBy?: string
  organizationName?: string
  /** e.g. "1 Sep – 30 Sep 2026", shown in the header meta strip. */
  periodLabel?: string
  /** Holders of `reports.view_all` may see cost, profit and margin. */
  canViewCost?: boolean
}

/** Margin is stored as a fraction (0.35) but rendered as a percentage (35). */
function marginPercent(row: Pick<ProductSalesByEmployeeRow, 'margin'>): number | null {
  return row.margin === null ? null : Number((row.margin * 100).toFixed(1))
}

function baseColumns(): ReportColumn[] {
  return [
    { key: 'ownerName', header: 'Employee' },
    { key: 'productName', header: 'Product' },
    { key: 'quantity', header: 'Units', align: 'right', format: 'number' },
    { key: 'revenue', header: 'Revenue', align: 'right', format: 'currency' },
  ]
}

function costColumns(): ReportColumn[] {
  return [
    { key: 'cost', header: 'Cost', align: 'right', format: 'currency' },
    { key: 'profit', header: 'Profit', align: 'right', format: 'currency' },
    { key: 'margin', header: 'Margin', align: 'right', format: 'percent' },
  ]
}

function toRows(
  rows: Array<ProductSalesByEmployeeRow | (ProductSalesByEmployeeRow & { productId?: string })>,
  canViewCost: boolean,
): Record<string, unknown>[] {
  return rows.map((row) => ({
    ownerId: row.ownerId,
    ownerName: row.ownerName,
    productId: row.productId,
    productName: row.productName,
    quantity: row.quantity,
    revenue: row.revenue,
    ...(canViewCost ? { cost: row.cost, profit: row.profit, margin: marginPercent(row) } : {}),
  }))
}

export function buildProductSalesReport(
  opts: BuildProductSalesReportOptions,
): UniversalReportDefinition {
  const { data, canViewCost = false } = opts
  const columns = canViewCost ? [...baseColumns(), ...costColumns()] : baseColumns()

  const metrics: ReportMetric[] = [
    { label: 'UNITS SOLD', value: formatNumber(data.grandTotal.quantity), tone: 'default' },
    { label: 'REVENUE', value: formatCurrency(data.grandTotal.revenue), tone: 'success' },
    ...(canViewCost
      ? ([
          { label: 'COST', value: formatCurrency(data.grandTotal.cost), tone: 'default' },
          { label: 'PROFIT', value: formatCurrency(data.grandTotal.profit), tone: data.grandTotal.profit < 0 ? ('danger' as const) : ('success' as const) },
          {
            label: 'MARGIN',
            value: data.grandTotal.margin === null ? '—' : `${marginPercent(data.grandTotal)}%`,
            tone: 'info',
          },
        ] as ReportMetric[])
      : []),
  ]

  return {
    name: 'Product-Sales-By-Employee',
    title: 'Product Sales by Employee',
    subtitle: 'Won-deal line items rolled up per employee and product',
    periodLabel: opts.periodLabel,
    metadata: {
      generatedAt: new Date().toISOString(),
      generatedBy: opts.generatedBy,
      organizationName: opts.organizationName,
      recordCount: data.rows.length,
    },
    filters: {
      Basis: 'Won deals only (closed date)',
      ...(opts.periodLabel ? { Period: opts.periodLabel } : {}),
    },
    metrics,
    charts: [
      {
        title: 'Revenue vs Cost by Employee',
        subtitle: canViewCost ? 'Won deals in the selected period' : 'Cost figures require reports.view_all',
        type: 'bar',
        data: data.employeeTotals.map((row) => ({
          name: row.ownerName,
          revenue: row.revenue,
          ...(canViewCost ? { cost: row.cost } : {}),
        })),
        xKey: 'name',
        series: canViewCost
          ? [
              { key: 'revenue', label: 'Revenue', color: '#059669' },
              { key: 'cost', label: 'Cost', color: '#e2e8f0' },
            ]
          : [{ key: 'revenue', label: 'Revenue', color: '#059669' }],
        currencyKeys: canViewCost ? ['revenue', 'cost'] : ['revenue'],
        height: 260,
      },
    ],
    tables: [
      {
        title: 'Product Sales by Employee',
        columns,
        rows: toRows(data.rows, canViewCost),
        emptyMessage: 'No won deals with line items in this period. Add products to a deal to see it here.',
      },
      {
        title: 'Employee Totals',
        columns,
        rows: toRows(data.employeeTotals, canViewCost),
        emptyMessage: 'No employee totals for this period.',
      },
      {
        title: 'Grand Total',
        columns,
        rows: toRows([data.grandTotal], canViewCost),
        emptyMessage: 'Nothing to total yet.',
      },
    ],
    orientation: 'landscape',
    footerNote: canViewCost
      ? undefined
      : 'Cost, profit and margin are hidden — they require the reports.view_all permission.',
  }
}