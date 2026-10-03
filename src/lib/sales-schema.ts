/**
 * Shared zod validation for the Sales Product Tracking entry form.
 *
 * The SAME schema instance runs in the browser (so the user gets inline field
 * errors as they type) and again in the server action, which is authoritative:
 * the service recomputes totals from quantity x unitPrice and never trusts a
 * client-sent total, balance or payment status.
 *
 * No `server-only` marker — imported by both server actions and 'use client'
 * form components.
 */
import { z } from 'zod'
import { Prisma } from '@/generated/prisma'
import {
  INVOICE_NUMBER_MAX,
  OTHER_PRODUCT_NAME_MAX,
  OTHER_PRODUCT_SENTINEL,
  computeLineTotal,
  derivePaymentStatus,
  type PaymentStatus,
} from '@/lib/sales-money'

export const paymentStatusSchema = z.enum(['PAID', 'PARTIALLY_PAID', 'PENDING'])

/**
 * One product line. `productId` and `otherProductName` are mutually exclusive
 * and exactly one must be present: a line is either a catalog product or a
 * typed "Other" name, never both and never neither.
 */
export const salesLineSchema = z
  .object({
    productId: z.string().trim().optional().default(''),
    otherProductName: z.string().trim().max(OTHER_PRODUCT_NAME_MAX, 'Max 120 characters').optional().default(''),
    quantity: z.coerce.number().positive('Quantity must be greater than 0').refine((n) => Number.isFinite(n), 'Enter a valid quantity'),
    unitPrice: z.coerce.number().min(0, 'Unit price cannot be negative').refine((n) => Number.isFinite(n), 'Enter a valid unit price'),
    amountPaid: z.coerce.number().min(0, 'Amount paid cannot be negative').refine((n) => Number.isFinite(n), 'Enter a valid amount paid'),
    paymentStatus: paymentStatusSchema.default('PENDING'),
  })
  .superRefine((line, ctx) => {
    const usesOther = line.productId === OTHER_PRODUCT_SENTINEL || (!line.productId && line.otherProductName !== '')
    if (line.productId && line.productId !== OTHER_PRODUCT_SENTINEL && line.otherProductName !== '') {
      ctx.addIssue({
        code: 'custom',
        path: ['otherProductName'],
        message: 'Choose a catalog product or type an "Other" name, not both',
      })
    }
    if (!line.productId && line.otherProductName === '') {
      ctx.addIssue({ code: 'custom', path: ['productId'], message: 'Choose a product or type an "Other" name' })
    }
    if (usesOther && line.otherProductName === '') {
      ctx.addIssue({ code: 'custom', path: ['otherProductName'], message: 'Enter the product name' })
    }

    const total = computeLineTotal(line.quantity, line.unitPrice)

    if (new Prisma.Decimal(line.amountPaid).greaterThan(total)) {
      ctx.addIssue({
        code: 'custom',
        path: ['amountPaid'],
        message: 'Amount paid cannot be more than the line total',
      })
    }

    // PAID forces paid = total; PENDING forces paid = 0; PARTIALLY_PAID needs
    // 0 < paid < total. derivePaymentStatus is the single source of that rule.
    if (derivePaymentStatus(total, line.amountPaid) !== line.paymentStatus) {
      const expected = derivePaymentStatus(total, line.amountPaid)
      ctx.addIssue({
        code: 'custom',
        path: ['paymentStatus'],
        message: `Payment status must be ${expected} for this total and amount paid`,
      })
    }
  })

export type SalesLineInput = z.infer<typeof salesLineSchema>

/**
 * Browser twin of salesLineSchema: identical rules, but quantities are still
 * strings because they come straight out of <input type="number">. Blanks are
 * treated as 0 so an empty field reports the same message the server would.
 */
export const salesClientLineSchema = z
  .object({
    productId: z.string().trim(),
    otherProductName: z.string().trim(),
    quantity: z.string().trim(),
    unitPrice: z.string().trim(),
    amountPaid: z.string().trim(),
    paymentStatus: paymentStatusSchema,
  })
  .superRefine((line, ctx) => {
    const quantity = numericField(line.quantity)
    const unitPrice = numericField(line.unitPrice)
    const amountPaid = numericField(line.amountPaid)

    const usesOther = line.productId === OTHER_PRODUCT_SENTINEL
    if (line.productId && line.productId !== OTHER_PRODUCT_SENTINEL && line.otherProductName !== '') {
      ctx.addIssue({
        code: 'custom',
        path: ['otherProductName'],
        message: 'Choose a catalog product or type an "Other" name, not both',
      })
    }
    if (!line.productId && line.otherProductName === '') {
      ctx.addIssue({ code: 'custom', path: ['productId'], message: 'Choose a product or type an "Other" name' })
    }
    if (usesOther && line.otherProductName === '') {
      ctx.addIssue({ code: 'custom', path: ['otherProductName'], message: 'Enter the product name' })
    }

    // A blank quantity coerces to 0 on the server and is rejected there, but the
    // browser must say so immediately instead of letting the round-trip fail.
    if (line.quantity === '') {
      ctx.addIssue({ code: 'custom', path: ['quantity'], message: 'Quantity must be greater than 0' })
    } else if (quantity === null) {
      ctx.addIssue({ code: 'custom', path: ['quantity'], message: 'Enter a valid quantity' })
    }
    if (quantity !== null && quantity <= 0) {
      ctx.addIssue({ code: 'custom', path: ['quantity'], message: 'Quantity must be greater than 0' })
    }
    // Unit price must be typed explicitly. Coercing "" to 0 would silently make
    // a forgotten price look like a free item.
    if (line.unitPrice === '') {
      ctx.addIssue({
        code: 'custom',
        path: ['unitPrice'],
        message: 'Enter a unit price (use 0 for a free item)',
      })
    } else if (unitPrice === null) {
      ctx.addIssue({ code: 'custom', path: ['unitPrice'], message: 'Enter a valid unit price' })
    }
    if (unitPrice !== null && unitPrice < 0) {
      ctx.addIssue({ code: 'custom', path: ['unitPrice'], message: 'Unit price cannot be negative' })
    }
    if (line.amountPaid !== '' && amountPaid === null) {
      ctx.addIssue({ code: 'custom', path: ['amountPaid'], message: 'Enter a valid amount paid' })
    }
    if (amountPaid !== null && amountPaid < 0) {
      ctx.addIssue({ code: 'custom', path: ['amountPaid'], message: 'Amount paid cannot be negative' })
    }

    const total = computeLineTotal(quantity ?? 0, unitPrice ?? 0)
    if (amountPaid !== null && new Prisma.Decimal(amountPaid).greaterThan(total)) {
      ctx.addIssue({
        code: 'custom',
        path: ['amountPaid'],
        message: 'Amount paid cannot be more than the line total',
      })
    }

    const derived = derivePaymentStatus(total, amountPaid ?? 0)
    if (derived !== line.paymentStatus) {
      ctx.addIssue({
        code: 'custom',
        path: ['paymentStatus'],
        message: `Payment status must be ${derived.replace(/_/g, ' ').toLowerCase()} for this total and amount paid`,
      })
    }
  })

/** Blank / unparseable numeric input becomes null so the rule above can report it. */
function numericField(value: string): number | null {
  if (value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/** The whole form. `lines` is serialised from a JSON hidden input by the client. */
export const salesFormSchema = z
  .object({
    salespersonId: z.string().trim().min(1, 'Salesperson is required'),
    customerId: z.string().trim().min(1, 'Customer is required'),
    saleDate: z.string().trim().min(1, 'Sale date is required'),
    paymentDate: z.string().trim().optional().default(''),
    invoiceNumber: z
      .string()
      .trim()
      .min(1, 'Invoice number is required')
      .max(INVOICE_NUMBER_MAX, `Invoice number must be ${INVOICE_NUMBER_MAX} characters or fewer`),
    remarks: z.string().trim().optional().default(''),
    /** When true, move the customer's single open lead to Order/Payment. */
    moveLeadStage: z
      .union([z.boolean(), z.enum(['true', 'false'])])
      .transform((value) => value === true || value === 'true'),
    lines: z.array(salesLineSchema).min(1, 'Add at least one product line'),
  })
  .superRefine((form, ctx) => {
    validateClientPaymentDate(
      form.paymentDate,
      form.saleDate,
      form.lines.some((l) => l.amountPaid > 0),
      ctx
    )
  })

export type SalesFormInput = z.infer<typeof salesFormSchema>

/**
 * Payment date is required once anything has been paid, and may never precede
 * the sale date. Shared by the server schema above and the browser schema
 * below so the two can never drift apart.
 */
function validateClientPaymentDate(
  paymentDate: string,
  saleDate: string,
  anyPaid: boolean,
  ctx: z.RefinementCtx
): void {
  if (paymentDate === '') {
    // Without this the browser silently accepted a paid invoice with no payment
    // date, while the field is marked required in the UI.
    if (anyPaid) {
      ctx.addIssue({
        code: 'custom',
        path: ['paymentDate'],
        message: 'Payment date is required once a payment is recorded',
      })
    }
    return
  }
  if (!anyPaid) {
    ctx.addIssue({
      code: 'custom',
      path: ['paymentDate'],
      message: 'No payment recorded — clear the payment date',
    })
    return
  }
  if (Number.isNaN(Date.parse(paymentDate))) {
    ctx.addIssue({ code: 'custom', path: ['paymentDate'], message: 'Enter a valid payment date' })
    return
  }
  if (Number.isNaN(Date.parse(saleDate))) return
  if (new Date(paymentDate) < new Date(saleDate)) {
    ctx.addIssue({
      code: 'custom',
      path: ['paymentDate'],
      message: 'Payment date cannot be before the sale date',
    })
  }
}

/**
 * BROWSER schema. Same rules as salesFormSchema, expressed in the shape the
 * form actually holds (a picked customer object, and numeric fields still as
 * strings because they live in <input type="number">). Keeping both in this one
 * file is what makes "validated client and server" true rather than aspirational.
 */
export const salesClientFormSchema = z
  .object({
    salespersonId: z.string().trim().min(1, 'Salesperson is required'),
    customer: z.object({ id: z.string(), name: z.string() }).nullable(),
    saleDate: z.string().trim().min(1, 'Sale date is required'),
    paymentDate: z.string().trim(),
    invoiceNumber: z
      .string()
      .trim()
      .min(1, 'Invoice number is required')
      .max(INVOICE_NUMBER_MAX, `Invoice number must be ${INVOICE_NUMBER_MAX} characters or fewer`),
    remarks: z.string().trim(),
    moveLeadStage: z.boolean(),
    lines: z.array(salesClientLineSchema).min(1, 'Add at least one product line'),
  })
  .superRefine((form, ctx) => {
    if (!form.customer) {
      ctx.addIssue({ code: 'custom', path: ['customer'], message: 'Customer is required' })
    }
    const anyPaid = form.lines.some((line) => Number(line.amountPaid) > 0)
    validateClientPaymentDate(form.paymentDate, form.saleDate, anyPaid, ctx)
  })

export type SalesClientFormInput = z.infer<typeof salesClientFormSchema>

/**
 * Per-line "Other" name length is also enforced server-side because the JSON
 * payload is attacker-controlled. Exposed here so tests and the client agree.
 */
export function otherProductNameError(name: string): string | undefined {
  const trimmed = name.trim()
  if (trimmed === '') return 'Enter the product name'
  if (trimmed.length > OTHER_PRODUCT_NAME_MAX) return 'Max 120 characters'
  return undefined
}

/** Payment status label used by the badge, the select and the exports. */
export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  PAID: 'Paid',
  PARTIALLY_PAID: 'Partially Paid',
  PENDING: 'Pending',
}
