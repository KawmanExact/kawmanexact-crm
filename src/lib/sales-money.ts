/**
 * Money / quantity arithmetic for Sales Product Tracking.
 *
 * Every figure here is a Prisma Decimal — never a JS float. The module is
 * deliberately dependency-free (no `server-only`) so the pure arithmetic can be
 * unit tested directly, and it is imported by both the client form (for live
 * totals) and the server service (which recomputes and is authoritative).
 *
 * Scale rules:
 *   money   — Decimal(15, 2)   (totalAmount, unitPrice, amountPaid, balanceAmount)
 *   qty     — Decimal(15, 3)   (ingredients are sold by kg)
 */
import { Prisma } from '@/generated/prisma'

export type PaymentStatus = 'PAID' | 'PARTIALLY_PAID' | 'PENDING'

export const PAYMENT_STATUSES: PaymentStatus[] = ['PAID', 'PARTIALLY_PAID', 'PENDING']

/** Placeholder used for "pick a product" in the form; never persisted. */
export const OTHER_PRODUCT_SENTINEL = '__other__'

/** Money scale used by Decimal(15,2) columns. */
export const MONEY_SCALE = 2
/** Quantity scale used by the Decimal(15,3) column (kg, three decimals). */
export const QUANTITY_SCALE = 3

export type DecimalLike = Prisma.Decimal | number | string | null | undefined

/**
 * Parse anything numeric-ish (form value, CSV cell, Decimal) into a Decimal.
 * Returns `null` for null/undefined/blank/non-numeric rather than throwing, so
 * callers can turn that into a validation error of their choosing.
 *
 * FIX: values read from the DB can be Decimal objects from a different copy of
 * decimal.js, which `instanceof Prisma.Decimal` rejects. They used to fall
 * through to `value.trim()` and crash. `Decimal.isDecimal` matches any copy, and
 * we re-wrap so callers always get OUR Decimal class.
 */
export function toDecimal(value: DecimalLike): Prisma.Decimal | null {
  if (value === null || value === undefined) return null

  if (Prisma.Decimal.isDecimal(value)) {
    return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(String(value))
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? new Prisma.Decimal(value) : null
  }

  // Last-resort guard: anything that isn't a string never reaches .trim().
  const text = typeof value === 'string' ? value : String(value)
  const trimmed = text.trim()
  if (trimmed === '') return null
  // Reject things Decimal.js would coerce to NaN, e.g. "abc".
  if (!/^-?\d*\.?\d+$/.test(trimmed)) return null
  try {
    const parsed = new Prisma.Decimal(trimmed)
    return Number.isNaN(parsed.toNumber()) ? null : parsed
  } catch {
    return null
  }
}

/** Coerce to Decimal, falling back to zero. Use for sums of already-valid rows. */
export function toDecimalOrZero(value: DecimalLike): Prisma.Decimal {
  return toDecimal(value) ?? new Prisma.Decimal(0)
}

export function zeroMoney(): Prisma.Decimal {
  return new Prisma.Decimal(0).toDecimalPlaces(MONEY_SCALE)
}

export function zeroQuantity(): Prisma.Decimal {
  return new Prisma.Decimal(0).toDecimalPlaces(QUANTITY_SCALE)
}

/**
 * Line total = quantity x unitPrice, rounded to the money scale (half-up, so
 * 0.1 x 3 = 0.3 rather than 0.30000000000000004).
 *
 * This is the TAXABLE value, not what the customer pays: GST is exclusive and
 * added on top by computeGstAmount, and freight is added after that by
 * computeInvoiceAmount. Keep the three steps distinct — collapsing them into one
 * number is how GST silently ends up excluded from an invoice total.
 */
export function computeLineTotal(
  quantity: DecimalLike,
  unitPrice: DecimalLike
): Prisma.Decimal {
  const q = toDecimalOrZero(quantity)
  const p = toDecimalOrZero(unitPrice)
  return q.times(p).toDecimalPlaces(MONEY_SCALE, Prisma.Decimal.ROUND_HALF_UP)
}

/**
 * GST on a taxable value at a percentage rate. The rate is a plain percent
 * (18 means 18%), not a fraction, because that is what the form collects and
 * what the GST return is filed against.
 */
export function computeGstAmount(taxable: DecimalLike, gstRatePercent: DecimalLike): Prisma.Decimal {
  const base = toDecimalOrZero(taxable)
  const rate = toDecimalOrZero(gstRatePercent)
  return base.times(rate).div(100).toDecimalPlaces(MONEY_SCALE, Prisma.Decimal.ROUND_HALF_UP)
}

/**
 * What the customer owes for a line, in the order the invoice reads:
 *
 *   taxable (qty x unitPrice)
 * + GST     (taxable x rate%)
 * + freight
 * = invoice amount
 *
 * Freight sits OUTSIDE the GST calculation rather than being added to the
 * taxable base, because freight is a separate supply under GST law — taxing it
 * as part of the goods value overstates the liability.
 */
export function computeInvoiceAmount(input: {
  taxable: DecimalLike
  gstAmount: DecimalLike
  freight: DecimalLike
}): Prisma.Decimal {
  return sumMoney([toDecimalOrZero(input.taxable), toDecimalOrZero(input.gstAmount), toDecimalOrZero(input.freight)])
}

/** Outstanding balance = invoice amount - amount paid, never below zero. */
export function computeBalance(
  invoiceAmount: DecimalLike,
  amountPaid: DecimalLike
): Prisma.Decimal {
  const diff = toDecimalOrZero(invoiceAmount).minus(toDecimalOrZero(amountPaid))
  const clamped = diff.isNegative() ? new Prisma.Decimal(0) : diff
  return clamped.toDecimalPlaces(MONEY_SCALE, Prisma.Decimal.ROUND_HALF_UP)
}

/**
 * Derive the payment status implied by invoiceAmount/paid. The status select in
 * the form is a constraint on this value, not an independent choice: PAID means
 * paid === invoiceAmount, PENDING means paid === 0, PARTIALLY_PAID is anything
 * strictly between. A zero-invoice line is treated as PENDING (nothing is owed
 * because nothing was billed) so a free/sample line does not claim to be PAID.
 *
 * Note this takes the INVOICE amount (taxable + GST + freight), not the taxable
 * line total — deciding "paid in full" against the pre-GST figure would let a
 * line be marked PAID while GST and freight are still outstanding.
 */
export function derivePaymentStatus(
  invoiceAmount: DecimalLike,
  amountPaid: DecimalLike
): PaymentStatus {
  const t = toDecimalOrZero(invoiceAmount).toDecimalPlaces(MONEY_SCALE, Prisma.Decimal.ROUND_HALF_UP)
  const paid = toDecimalOrZero(amountPaid)
  if (t.lessThanOrEqualTo(0)) return 'PENDING'
  if (paid.lessThanOrEqualTo(0)) return 'PENDING'
  if (paid.greaterThanOrEqualTo(t)) return 'PAID'
  return 'PARTIALLY_PAID'
}

/** True when `status` and the (invoiceAmount, paid) pair agree with derivePaymentStatus. */
export function isPaymentStatusConsistent(
  status: PaymentStatus,
  invoiceAmount: DecimalLike,
  amountPaid: DecimalLike
): boolean {
  return derivePaymentStatus(invoiceAmount, amountPaid) === status
}

/**
 * Advance received against a line. An advance is money already in hand, so it is
 * part of what counts toward PAID — otherwise an invoice fully covered by an
 * advance would still show as pending. Clamped at the invoice amount: an advance
 * larger than the bill is a customer overpayment, not a negative balance.
 */
export function computeAdvanceApplied(advance: DecimalLike, invoiceAmount: DecimalLike): Prisma.Decimal {
  const a = toDecimalOrZero(advance)
  const cap = toDecimalOrZero(invoiceAmount)
  return (a.greaterThan(cap) ? cap : a).toDecimalPlaces(MONEY_SCALE, Prisma.Decimal.ROUND_HALF_UP)
}

/**
 * Post-dated cheque value promised against a line. This is a future obligation,
 * NOT a payment: it must never be added to amountPaid or it would mark an unpaid
 * invoice as settled. It is only ever reported alongside the balance, and the
 * outstanding figure is checked against it so an over-committed PDC is caught
 * before the invoice is filed.
 */
export function computeOutstandingAfterPdc(input: {
  balance: DecimalLike
  pdcAmount: DecimalLike
}): Prisma.Decimal {
  const diff = toDecimalOrZero(input.balance).minus(toDecimalOrZero(input.pdcAmount))
  const clamped = diff.isNegative() ? new Prisma.Decimal(0) : diff
  return clamped.toDecimalPlaces(MONEY_SCALE, Prisma.Decimal.ROUND_HALF_UP)
}

/**
 * Everything money-related for one invoice line, derived in invoice order so no
 * step can be skipped or computed out of sequence. This is the single source of
 * truth shared by the live form, the server action, the KPIs and every export —
 * all four call this so a figure on screen, in the DB and in a spreadsheet cannot
 * disagree.
 *
 * The chain:
 *   taxable        = quantity x unitPrice
 *   gstAmount      = taxable x gstRate%
 *   invoiceAmount  = taxable + gstAmount + freight
 *   paid           = amountPaid (advance already folded in by the caller)
 *   balance        = invoiceAmount - paid
 */
export interface LineMoney {
  quantity: Prisma.Decimal
  unitPrice: Prisma.Decimal
  /** quantity x unitPrice — the taxable value GST is charged on. */
  taxableAmount: Prisma.Decimal
  gstRate: Prisma.Decimal
  gstAmount: Prisma.Decimal
  freightAmount: Prisma.Decimal
  /** What the customer owes: taxable + GST + freight. */
  invoiceAmount: Prisma.Decimal
  advanceAmount: Prisma.Decimal
  pdcAmount: Prisma.Decimal
  amountPaid: Prisma.Decimal
  balanceAmount: Prisma.Decimal
  /** balance minus the promised PDC — the part with no payment attached at all. */
  uncoveredAmount: Prisma.Decimal
  paymentStatus: PaymentStatus
}

export function deriveLineMoneyDetail(input: {
  quantity: DecimalLike
  unitPrice: DecimalLike
  gstRate?: DecimalLike
  freightAmount?: DecimalLike
  advanceAmount?: DecimalLike
  pdcAmount?: DecimalLike
  amountPaid: DecimalLike
}): LineMoney {
  const quantity = toQuantity(input.quantity)
  const unitPrice = toMoney(input.unitPrice)
  const taxableAmount = computeLineTotal(quantity, unitPrice)
  const gstRate = toMoney(input.gstRate ?? 0)
  const gstAmount = computeGstAmount(taxableAmount, gstRate)
  const freightAmount = toMoney(input.freightAmount ?? 0)
  const invoiceAmount = computeInvoiceAmount({ taxable: taxableAmount, gstAmount, freight: freightAmount })
  const advanceAmount = toMoney(input.advanceAmount ?? 0)
  const pdcAmount = toMoney(input.pdcAmount ?? 0)
  const amountPaid = computeAdvanceApplied(input.amountPaid, invoiceAmount)
  const balanceAmount = computeBalance(invoiceAmount, amountPaid)
  const uncoveredAmount = computeOutstandingAfterPdc({ balance: balanceAmount, pdcAmount })

  return {
    quantity,
    unitPrice,
    taxableAmount,
    gstRate,
    gstAmount,
    freightAmount,
    invoiceAmount,
    advanceAmount,
    pdcAmount,
    amountPaid,
    balanceAmount,
    uncoveredAmount,
    paymentStatus: derivePaymentStatus(invoiceAmount, amountPaid),
  }
}

/** Round to the money scale (half-up) — for values read back from Decimal columns. */
export function toMoney(value: DecimalLike): Prisma.Decimal {
  return toDecimalOrZero(value).toDecimalPlaces(MONEY_SCALE, Prisma.Decimal.ROUND_HALF_UP)
}

/** Round to the quantity scale (3 dp, half-up). */
export function toQuantity(value: DecimalLike): Prisma.Decimal {
  return toDecimalOrZero(value).toDecimalPlaces(QUANTITY_SCALE, Prisma.Decimal.ROUND_HALF_UP)
}

/** Sum an iterable of decimals into a single money-scale Decimal. */
export function sumMoney(values: Iterable<DecimalLike>): Prisma.Decimal {
  let total = new Prisma.Decimal(0)
  for (const value of values) total = total.plus(toDecimalOrZero(value))
  return total.toDecimalPlaces(MONEY_SCALE, Prisma.Decimal.ROUND_HALF_UP)
}

/** Sum an iterable of decimals into a single quantity-scale Decimal. */
export function sumQuantity(values: Iterable<DecimalLike>): Prisma.Decimal {
  let total = new Prisma.Decimal(0)
  for (const value of values) total = total.plus(toDecimalOrZero(value))
  return total.toDecimalPlaces(QUANTITY_SCALE, Prisma.Decimal.ROUND_HALF_UP)
}

/**
 * Plain string for display / export. Decimal.js avoids exponent notation and
 * keeps trailing zeros, so `-0.300` stays `-0.300` and `1E+7` never appears.
 */
export function decimalToString(value: DecimalLike): string {
  const d = toDecimalOrZero(value)
  if (d.isZero()) return '0'
  return d.toFixed()
}

/** Canonical invoice key: trimmed + lower-cased, so " INV-01 " === "inv-01". */
export function buildInvoiceKey(invoiceNumber: string): string {
  return invoiceNumber.trim().toLowerCase()
}

/** Maximum stored length of an invoice number (enforced in zod and in the form). */
export const INVOICE_NUMBER_MAX = 50
/** Maximum length of a typed "Other" product name. */
export const OTHER_PRODUCT_NAME_MAX = 120

/**
 * Validate a typed "Other" product name. Used by the form and re-checked
 * server-side because the `lines` payload is raw JSON.
 * Returns an error message, or undefined when the name is acceptable.
 */
export function otherProductNameIsValid(name: string | null | undefined): string | undefined {
  const trimmed = (name ?? '').trim()
  if (trimmed === '') return 'Enter the product name'
  if (trimmed.length > OTHER_PRODUCT_NAME_MAX) return 'Max 120 characters'
  return undefined
}