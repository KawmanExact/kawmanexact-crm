// Sales Product Tracking domain types. Mirror the prisma/schema.prisma
// SalesTransaction + Product shapes as flat, render-ready rows so pages and
// client components never touch Decimal objects or Prisma relations directly.
// See src/services/sales.service.ts for the mapping.

import type { PaymentStatus } from '@/lib/sales-money'
import type { SalesFilters } from '@/lib/sales-filters'

export type { PaymentStatus }

export const PRODUCT_CATEGORIES = [
  'Nutraceutical',
  'Cosmetic',
  'Food & Beverage',
] as const

/** Sentinel id used by the "Other (type name)" option in product dropdowns. */
export const PRODUCT_OTHER_OPTION = '__other__'

export interface ProductAttributes {
  [key: string]: string
}

export interface ProductRow {
  id: string
  name: string
  sku: string | null
  category: string | null
  grade: string | null
  variant: string | null
  unit: string
  defaultUnitPrice: number | null
  unitCost: number | null
  unitPrice: number | null
  description: string | null
  attributes: ProductAttributes | null
  isActive: boolean
  /** Number of sales lines referencing this product. */
  salesCount: number
  createdAt: string
}

export interface SalesTransactionRow {
  id: string
  groupId: string
  lineNumber: number
  saleDate: string
  invoiceNumber: string
  invoiceKey: string
  salespersonId: string
  salespersonName: string
  customerId: string
  customerName: string
  productId: string | null
  /** Display name: catalog "Name - variant", or the typed "Other" name. */
  productName: string
  otherProductName: string | null
  isOtherProduct: boolean
  unit: string
  quantity: number
  unitPrice: number
  /** Taxable value = quantity x unitPrice. GST is charged on top of this. */
  totalAmount: number
  hsnCode: string | null
  gstRate: number
  gstAmount: number
  freightAmount: number
  /** What the customer owes = totalAmount + gstAmount + freightAmount. */
  invoiceAmount: number
  advanceAmount: number
  pdcAmount: number
  amountPaid: number
  balanceAmount: number
  /** balanceAmount - pdcAmount: the part with no payment or promise against it. */
  uncoveredAmount: number
  paymentStatus: PaymentStatus
  paymentDate: string | null
  paymentMode: string | null
  purchaseOrderNo: string | null
  leadTimeDays: number | null
  remarks: string | null
}

export interface SalesKpis {
  /** Distinct invoices (groupId) in the filtered set. */
  totalSales: number
  /** Line rows in the filtered set. */
  transactionCount: number
  /** Null when the filtered rows mix units — see quantityByUnit. */
  totalQuantity: number | null
  quantityByUnit: Array<{ unit: string; quantity: number }>
  totalSalesValue: number
  totalAmountPaid: number
  totalPendingAmount: number
  totalProductsSold: number
  /** Pre-GST subtotal = sum of quantity x unitPrice. */
  totalTaxableValue: number
  totalGstAmount: number
  totalFreightAmount: number
  totalAdvanceAmount: number
  totalPdcAmount: number
}

export interface ProductBreakdownRow {
  /** Stable key: product id, or `other:<name>` for a typed "Other" product. */
  key: string
  productId: string | null
  productName: string
  isOther: boolean
  unit: string
  quantity: number
  /** Invoice value = taxable + GST + freight. Shares are computed on this. */
  totalValue: number
  /** Pre-GST subtotal = quantity x unitPrice. */
  taxableValue: number
  /**
   * Weighted-average unit price: taxableValue / quantity.
   * Null when the group sold zero — there is no meaningful
   * average price and dividing would be a divide-by-zero.
   */
  avgUnitPrice: number | null
  gstAmount: number
  amountPaid: number
  pendingAmount: number
  transactionCount: number
  /** Share of the filtered sales value, 0-100. */
  share: number
}

export interface SalespersonBreakdownRow {
  salespersonId: string
  salespersonName: string
  unit: string
  /** Null when this person's rows mix units — see quantityByUnit. */
  totalQuantity: number | null
  quantityByUnit: Array<{ unit: string; quantity: number }>
  totalSalesValue: number
  amountPaid: number
  pendingAmount: number
  /** One entry per product this salesperson sold. */
  products: ProductBreakdownRow[]
}

export interface SalesPageData {
  rows: SalesTransactionRow[]
  total: number
  page: number
  pageSize: number
  pageCount: number
  kpis: SalesKpis
  productBreakdown: ProductBreakdownRow[]
  salespersonBreakdown: SalespersonBreakdownRow[]
  /** Present when a single salesperson filter is active. */
  salespersonSummary: {
    salespersonId: string
    salespersonName: string
    totalProductsSold: number
    /** Null when the filtered rows mix units — see quantityByUnit. */
    totalQuantity: number | null
    quantityByUnit: Array<{ unit: string; quantity: number }>
    totalSalesValue: number
    amountPaid: number
    pendingAmount: number
    products: ProductBreakdownRow[]
  } | null
  /** The parsed filters, so the UI and print view can restate what is applied. */
  filters: SalesFilters
  filterLabels: { salesperson?: string; customer?: string; product?: string }
  truncated: boolean
}

export interface ProductOption {
  id: string
  name: string
  variant: string | null
  category: string | null
  unit: string
  defaultUnitPrice: number | null
  unitCost: number | null
  unitPrice: number | null
}

/** "Name - variant" when a variant exists, otherwise just the name. */
export function productOptionLabel(option: {
  name: string
  variant?: string | null
}): string {
  const variant = option.variant?.trim()
  return variant ? `${option.name} - ${variant}` : option.name
}
