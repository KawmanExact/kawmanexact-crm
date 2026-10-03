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
 */
export function toDecimal(value: DecimalLike): Prisma.Decimal | null {
  if (value === null || value === undefined) return null
  if (value instanceof Prisma.Decimal) return value
  if (typeof value === 'number') {
    return Number.isFinite(value) ? new Prisma.Decimal(value) : null
  }
  const trimmed = value.trim()
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
 */
export function computeLineTotal(
  quantity: DecimalLike,
  unitPrice: DecimalLike
): Prisma.Decimal {
  const q = toDecimalOrZero(quantity)
  const p = toDecimalOrZero(unitPrice)
  return q.times(p).toDecimalPlaces(MONEY_SCALE, Prisma.Decimal.ROUND_HALF_UP)
}

/** Outstanding balance = line total - amount paid, never below zero. */
export function computeBalance(
  total: DecimalLike,
  amountPaid: DecimalLike
): Prisma.Decimal {
  const diff = toDecimalOrZero(total).minus(toDecimalOrZero(amountPaid))
  const clamped = diff.isNegative() ? new Prisma.Decimal(0) : diff
  return clamped.toDecimalPlaces(MONEY_SCALE, Prisma.Decimal.ROUND_HALF_UP)
}

/**
 * Derive the payment status implied by total/paid. The status select in the
 * form is a constraint on this value, not an independent choice: PAID means
 * paid === total, PENDING means paid === 0, PARTIALLY_PAID is anything strictly
 * between. A zero-total line is treated as PENDING (nothing is owed because
 * nothing was billed) so a free/sample line does not claim to be PAID.
 */
export function derivePaymentStatus(
  total: DecimalLike,
  amountPaid: DecimalLike
): PaymentStatus {
  const t = toDecimalOrZero(total).toDecimalPlaces(MONEY_SCALE, Prisma.Decimal.ROUND_HALF_UP)
  const paid = toDecimalOrZero(amountPaid)
  if (t.lessThanOrEqualTo(0)) return 'PENDING'
  if (paid.lessThanOrEqualTo(0)) return 'PENDING'
  if (paid.greaterThanOrEqualTo(t)) return 'PAID'
  return 'PARTIALLY_PAID'
}

/** True when `status` and the (total, paid) pair agree with derivePaymentStatus. */
export function isPaymentStatusConsistent(
  status: PaymentStatus,
  total: DecimalLike,
  amountPaid: DecimalLike
): boolean {
  return derivePaymentStatus(total, amountPaid) === status
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
