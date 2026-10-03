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
    moveLeadStage: z.coerce.boolean().default(false),
    lines: z.array(salesLineSchema).min(1, 'Add at least one product line'),
  })
  .superRefine((form, ctx) => {
    if (form.paymentDate === '') return
    const paid = form.lines.some((line) => line.amountPaid > 0)
    if (!paid) {
      ctx.addIssue({ code: 'custom', path: ['paymentDate'], message: 'No payment recorded — clear the payment date' })
      return
    }
    if (Number.isNaN(Date.parse(form.saleDate)) || Number.isNaN(Date.parse(form.paymentDate))) {
      ctx.addIssue({ code: 'custom', path: ['paymentDate'], message: 'Enter valid dates' })
      return
    }
    if (new Date(form.paymentDate) < new Date(form.saleDate)) {
      ctx.addIssue({
        code: 'custom',
        path: ['paymentDate'],
        message: 'Payment date cannot be before the sale date',
      })
    }
  })

export type SalesFormInput = z.infer<typeof salesFormSchema>

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
