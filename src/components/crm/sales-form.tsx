'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Plus, Trash2 } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge, type BadgeVariant } from '@/components/ui/badge'
import { CompanyPicker } from '@/components/crm/company-picker'
import { formatCurrency, cn } from '@/lib/utils'
import {
  deriveLineMoneyDetail,
  toDecimalOrZero,
  OTHER_PRODUCT_SENTINEL,
  type PaymentStatus,
} from '@/lib/sales-money'
import { Prisma as PrismaNS } from '@/generated/prisma'
import {
  salesClientFormSchema,
  type SalesClientFormInput,
  PAYMENT_STATUS_LABEL,
} from '@/lib/sales-schema'
import { saveSaleAction, updateSaleAction } from '@/app/sales-tracking/actions'
import type { ProductOption, SalesTransactionRow } from '@/types/sales'
import { productOptionLabel } from '@/types/sales'
import { STANDARD_PRODUCTS } from '@/lib/products'

const STATUS_VARIANT: Record<PaymentStatus, BadgeVariant> = {
  PAID: 'success',
  PARTIALLY_PAID: 'warning',
  PENDING: 'danger',
}

/** Scroll target for a form-level validation error. */
const SALES_ERROR_ANCHOR_ID = 'sales-error-anchor'

export interface SalesFormLine {
  productId: string
  otherProductName: string
  quantity: string
  unitPrice: string
  amountPaid: string
  paymentStatus: PaymentStatus
  hsnCode: string
  gstRate: string
  freightAmount: string
  leadTimeDays: string
  advanceAmount: string
  pdcAmount: string
  paymentMode: string
  purchaseOrderNo: string
}

const emptyLine = (): SalesFormLine => ({
  productId: '',
  otherProductName: '',
  quantity: '',
  unitPrice: '',
  amountPaid: '',
  paymentStatus: 'PENDING',
  hsnCode: '',
  gstRate: '',
  freightAmount: '',
  leadTimeDays: '',
  advanceAmount: '',
  pdcAmount: '',
  paymentMode: '',
  purchaseOrderNo: '',
})

function todayInputValue(): string {
  const now = new Date()
  const offset = now.getTimezoneOffset()
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10)
}

/**
 * Sales entry form.
 *
 * react-hook-form drives the dynamic multi-line array (useFieldArray) and the
 * shared zod schema validates in the browser; `saveSaleAction`/`updateSaleAction`
 * re-validate and are authoritative — it recomputes every total, balance and
 * payment status from Decimals and ignores whatever this form sends for them.
 *
 * Live totals below use the SAME Decimal helpers the server uses, so what the
 * user sees while typing is what gets stored.
 */
export function SalesForm({
  products,
  salespeople,
  currentUserId,
  canPickSalesperson,
  sale,
}: {
  products: ProductOption[]
  salespeople: Array<{ id: string; name: string }>
  currentUserId: string
  canPickSalesperson: boolean
  /** Present when editing: every line of the invoice, sharing one groupId. */
  sale?: { groupId: string; rows: SalesTransactionRow[] }
}) {
  const router = useRouter()
  const isEdit = Boolean(sale)

  const {
    control,
    register,
    handleSubmit,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<SalesClientFormInput>({
    resolver: zodResolver(salesClientFormSchema),
    defaultValues: {
      salespersonId: sale?.rows[0]?.salespersonId ?? currentUserId,
      customer: sale ? { id: sale.rows[0].customerId, name: sale.rows[0].customerName } : null,
      saleDate: sale ? sale.rows[0].saleDate.slice(0, 10) : todayInputValue(),
      paymentDate: sale?.rows[0].paymentDate?.slice(0, 10) ?? '',
      invoiceNumber: sale?.rows[0].invoiceNumber ?? '',
      remarks: sale?.rows[0].remarks ?? '',
      moveLeadStage: false,
      lines: sale
        ? sale.rows.map((row) => {
            const isStandard = !row.isOtherProduct && !row.productId && row.otherProductName && STANDARD_PRODUCTS.includes(row.otherProductName as any)
            const stdIndex = isStandard ? STANDARD_PRODUCTS.indexOf(row.otherProductName as any) : -1
            return {
              productId: row.isOtherProduct ? OTHER_PRODUCT_SENTINEL : (isStandard ? `std-${stdIndex}` : (row.productId ?? '')),
              otherProductName: row.otherProductName ?? '',
              quantity: String(row.quantity),
              unitPrice: String(row.unitPrice),
              amountPaid: String(row.amountPaid),
              paymentStatus: row.paymentStatus,
              hsnCode: row.hsnCode ?? '',
              gstRate: row.gstRate ? String(row.gstRate) : '',
              freightAmount: row.freightAmount ? String(row.freightAmount) : '',
              leadTimeDays: row.leadTimeDays !== null ? String(row.leadTimeDays) : '',
              advanceAmount: row.advanceAmount ? String(row.advanceAmount) : '',
              pdcAmount: row.pdcAmount ? String(row.pdcAmount) : '',
              paymentMode: row.paymentMode ?? '',
              purchaseOrderNo: row.purchaseOrderNo ?? '',
            }
          })
        : [emptyLine()],
    },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'lines' })

  const lineValues = useWatch({ control, name: 'lines' })
  const customer = useWatch({ control, name: 'customer' })
  const moveLeadStage = useWatch({ control, name: 'moveLeadStage' })

  // The single place a catalog product's default price/unit is applied.
  const productById = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products]
  )

  const productOptions = useMemo(
    () => [...products].sort((a, b) => productOptionLabel(a).localeCompare(productOptionLabel(b))),
    [products]
  )

  /**
   * Live recomputation of one line, using the server's Decimal helpers — the
   * same deriveLineMoneyDetail the save action runs, so the invoice amount shown
   * here is byte-for-byte what gets stored.
   */
  function lineTotals(line: SalesFormLine | undefined) {
    const n = (value: string | undefined) => {
      const parsed = Number(value)
      return Number.isFinite(parsed) ? parsed : 0
    }
    return deriveLineMoneyDetail({
      quantity: n(line?.quantity),
      unitPrice: n(line?.unitPrice),
      gstRate: n(line?.gstRate),
      freightAmount: n(line?.freightAmount),
      advanceAmount: n(line?.advanceAmount),
      pdcAmount: n(line?.pdcAmount),
      amountPaid: n(line?.amountPaid),
    })
  }

  function onProductChange(index: number, value: string) {
    setValue(`lines.${index}.productId`, value, { shouldValidate: true })
    if (value === OTHER_PRODUCT_SENTINEL) {
      // Keep the typed name when switching back and forth.
      return
    }
    const product = productById.get(value)
    if (product?.defaultUnitPrice !== null && product?.defaultUnitPrice !== undefined) {
      setValue(`lines.${index}.unitPrice`, String(product.defaultUnitPrice), { shouldValidate: true })
    }
  }

  /**
   * Keep status, paid and date consistent when the status select is used. PAID
   * fills in the INVOICE amount (taxable + GST + freight), not the pre-GST line
   * total — otherwise picking PAID would leave GST and freight unpaid.
   */
  function onStatusChange(index: number, status: PaymentStatus) {
    const { invoiceAmount } = lineTotals(getValues(`lines.${index}`))
    setValue(`lines.${index}.paymentStatus`, status, { shouldValidate: true })
    if (status === 'PAID') {
      setValue(`lines.${index}.amountPaid`, invoiceAmount.toFixed(2), { shouldValidate: true })
    } else if (status === 'PENDING') {
      setValue(`lines.${index}.amountPaid`, '0', { shouldValidate: true })
    }
  }

  const onSubmit = handleSubmit(async (values) => {
    const formData = new FormData()
    if (sale) formData.set('groupId', sale.groupId)
    formData.set('salespersonId', values.salespersonId)
    formData.set('customerId', values.customer?.id ?? '')
    formData.set('saleDate', values.saleDate)
    formData.set('paymentDate', values.paymentDate)
    formData.set('invoiceNumber', values.invoiceNumber)
    formData.set('remarks', values.remarks)
    if (values.moveLeadStage) formData.set('moveLeadStage', 'on')
    formData.set(
      'lines',
      JSON.stringify(
        values.lines.map((line: SalesFormLine) => ({
          productId: line.productId,
          otherProductName: line.otherProductName,
          quantity: line.quantity === '' ? 0 : Number(line.quantity),
          unitPrice: line.unitPrice === '' ? 0 : Number(line.unitPrice),
          amountPaid: line.amountPaid === '' ? 0 : Number(line.amountPaid),
          paymentStatus: line.paymentStatus,
          hsnCode: line.hsnCode,
          gstRate: line.gstRate === '' ? 0 : Number(line.gstRate),
          freightAmount: line.freightAmount === '' ? 0 : Number(line.freightAmount),
          leadTimeDays: line.leadTimeDays === '' ? 0 : Number(line.leadTimeDays),
          advanceAmount: line.advanceAmount === '' ? 0 : Number(line.advanceAmount),
          pdcAmount: line.pdcAmount === '' ? 0 : Number(line.pdcAmount),
          paymentMode: line.paymentMode,
          purchaseOrderNo: line.purchaseOrderNo,
        }))
      )
    )

    const result = sale ? await updateSaleAction({}, formData) : await saveSaleAction({}, formData)
    if (result.error) toast.error(result.error)
    if (result.fieldErrors && Object.keys(result.fieldErrors).length > 0) {
      // Scrolled to from a submit handler by id rather than by ref, so no ref
      // value is captured in the handleSubmit closure created during render.
      document.getElementById(SALES_ERROR_ANCHOR_ID)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
      toast.error(Object.values(result.fieldErrors)[0])
      return
    }
    if (result.success) {
      toast.success(isEdit ? 'Sale updated' : 'Sale recorded')
      if (result.notice) toast.warning(result.notice)
      router.push('/sales-tracking')
      router.refresh()
    }
  })

  /**
   * Invoice-level totals, accumulated from the same per-line derivation the save
   * action uses. Summed from Decimals rather than by adding the displayed
   * strings, so the figure here matches the stored `total` to the paisa.
   */
  const invoiceTotals = (lineValues ?? []).reduce(
    (acc, line) => {
      const t = lineTotals(line)
      return {
        taxable: acc.taxable.plus(t.taxableAmount),
        gst: acc.gst.plus(t.gstAmount),
        freight: acc.freight.plus(t.freightAmount),
        invoice: acc.invoice.plus(t.invoiceAmount),
        paid: acc.paid.plus(t.amountPaid),
        balance: acc.balance.plus(t.balanceAmount),
        advance: acc.advance.plus(t.advanceAmount),
        pdc: acc.pdc.plus(t.pdcAmount),
        uncovered: acc.uncovered.plus(t.uncoveredAmount),
      }
    },
    {
      taxable: toDecimalOrZero(0),
      gst: toDecimalOrZero(0),
      freight: toDecimalOrZero(0),
      invoice: toDecimalOrZero(0),
      paid: toDecimalOrZero(0),
      balance: toDecimalOrZero(0),
      advance: toDecimalOrZero(0),
      pdc: toDecimalOrZero(0),
      uncovered: toDecimalOrZero(0),
    }
  )

  return (
    <form onSubmit={onSubmit} className="space-y-6 max-w-5xl" noValidate>
      <Card className="bg-[#0a111c]/80 border-white/[0.08] p-5 space-y-4">
        <div id={SALES_ERROR_ANCHOR_ID} />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="salespersonId" className="text-sm text-white/70">
              Salesperson<span className="text-red-400"> *</span>
            </label>
            {canPickSalesperson ? (
              <select
                id="salespersonId"
                {...register('salespersonId')}
                className="h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
              >
                {salespeople.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                    {person.id === currentUserId ? ' (you)' : ''}
                  </option>
                ))}
              </select>
            ) : (
              <>
                <input type="hidden" {...register('salespersonId')} />
                <select
                  id="salespersonId"
                  value={currentUserId}
                  disabled
                  aria-label="Salesperson (you)"
                  className="h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white/50 cursor-not-allowed"
                >
                  <option value={currentUserId}>
                    {salespeople.find((p) => p.id === currentUserId)?.name ?? 'You'} (you)
                  </option>
                </select>
              </>
            )}
            {errors.salespersonId && (
              <p className="text-xs text-red-400">{errors.salespersonId.message}</p>
            )}
          </div>

          <CompanyPicker
            label="Customer"
            required
            value={customer ?? null}
            onChange={(company) => setValue('customer', company, { shouldValidate: true })}
            error={errors.customer ? 'Customer is required' : undefined}
          />
          {/* The picker holds the object; the action reads this hidden id. */}
          <input type="hidden" value={customer?.id ?? ''} readOnly tabIndex={-1} />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Sale date" required error={errors.saleDate?.message}>
            <Input type="date" {...register('saleDate')} aria-invalid={Boolean(errors.saleDate)} />
          </Field>
          <Field
            label="Invoice number"
            required
            hint="Unique per organisation (case-insensitive)"
            error={errors.invoiceNumber?.message}
          >
            <Input
              {...register('invoiceNumber')}
              placeholder="INV-2026-001"
              maxLength={50}
              aria-invalid={Boolean(errors.invoiceNumber)}
            />
          </Field>
          <Field
            label="Payment date"
            hint="Required once any line has an amount paid"
            error={errors.paymentDate?.message}
          >
            <Input type="date" {...register('paymentDate')} aria-invalid={Boolean(errors.paymentDate)} />
          </Field>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="remarks" className="text-sm text-white/70">
            Remarks
          </label>
          <textarea
            id="remarks"
            rows={2}
            {...register('remarks')}
            placeholder="Optional notes stored on every line of this invoice"
            className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
          />
        </div>

        <label className="flex items-start gap-2 text-sm text-white/70">
          <input
            type="checkbox"
            {...register('moveLeadStage')}
            className="mt-0.5 h-4 w-4 rounded border-white/20 bg-white/[0.04] accent-purple-600"
          />
          <span>
            Also move the customer&rsquo;s open deal to Order/Payment stage
            <span className="block text-xs text-white/40">
              Order while anything is outstanding, Payment when fully paid. Only applies when the
              customer has exactly one open deal.
            </span>
          </span>
        </label>
        {moveLeadStage && (
          <p className="text-xs text-amber-300/80">
            The deal stage will only change if this customer has exactly one open deal.
          </p>
        )}
      </Card>

      <Card className="bg-[#0a111c]/80 border-white/[0.08] p-5 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-medium text-white/80">Products</h2>
            <p className="mt-0.5 text-xs text-white/40">
              One line per product. Total and balance are calculated for you and re-checked on save.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => append(emptyLine())}
          >
            <Plus className="h-3.5 w-3.5" /> Add another product
          </Button>
        </div>

        {fields.map((field, index) => {
          const line = lineValues?.[index]
          const totals = lineTotals(line)
          const usesOther = line?.productId === OTHER_PRODUCT_SENTINEL
          const lineErrors = (errors.lines?.[index] ?? {}) as Record<string, { message?: string }>

          return (
            <div
              key={field.id}
              className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="text-xs font-medium uppercase tracking-wider text-white/35">
                  Line {index + 1}
                </span>
                {fields.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-red-400 hover:text-red-300"
                    aria-label={`Remove line ${index + 1}`}
                    onClick={() => remove(index)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1.5 lg:col-span-2">
                  <label htmlFor={`lines.${index}.productId`} className="text-sm text-white/70">
                    Product<span className="text-red-400"> *</span>
                  </label>
                  <select
                    id={`lines.${index}.productId`}
                    value={line?.productId ?? ''}
                    onChange={(event) => onProductChange(index, event.target.value)}
                    aria-invalid={Boolean(lineErrors.productId)}
                    className="h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                  >
                    <option value="">Select a product…</option>
                    {productOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {productOptionLabel(option)}
                      </option>
                    ))}
                    <option value={OTHER_PRODUCT_SENTINEL}>Other (type name)</option>
                  </select>
                  {lineErrors.productId && (
                    <p className="text-xs text-red-400">{lineErrors.productId.message}</p>
                  )}
                </div>

                {usesOther && (
                  <div className="space-y-1.5 lg:col-span-2">
                    <label htmlFor={`lines.${index}.otherProductName`} className="text-sm text-white/70">
                      Other product name<span className="text-red-400"> *</span>
                    </label>
                    <Input
                      id={`lines.${index}.otherProductName`}
                      {...register(`lines.${index}.otherProductName` as const)}
                      placeholder="Type the product name"
                      maxLength={120}
                      aria-invalid={Boolean(lineErrors.otherProductName)}
                    />
                    {lineErrors.otherProductName && (
                      <p className="text-xs text-red-400">{lineErrors.otherProductName.message}</p>
                    )}
                  </div>
                )}
              </div>

              {/* Row 1 — the goods. Read-only cells show the running result of
                  the row above so the arithmetic reads top-to-bottom in the
                  same order an invoice is laid out. */}
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
                <Field
                  label="Quantity"
                  required
                  error={lineErrors.quantity?.message}
                  hint={!usesOther ? productById.get(line?.productId ?? '')?.unit : undefined}
                >
                  <Input
                    type="number"
                    step="0.001"
                    min="0"
                    inputMode="decimal"
                    {...register(`lines.${index}.quantity` as const, { valueAsNumber: false })}
                    aria-invalid={Boolean(lineErrors.quantity)}
                  />
                </Field>
                <Field label="Unit price (excl. GST)" required error={lineErrors.unitPrice?.message}>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    {...register(`lines.${index}.unitPrice` as const, { valueAsNumber: false })}
                    aria-invalid={Boolean(lineErrors.unitPrice)}
                  />
                </Field>
                <Field label="Taxable value" hint="Quantity × unit price">
                  <ReadOnlyMoney
                    label={`Line ${index + 1} taxable value`}
                    value={totals.taxableAmount}
                  />
                </Field>
                <Field label="GST Rate (%)" error={lineErrors.gstRate?.message}>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    inputMode="decimal"
                    {...register(`lines.${index}.gstRate` as const, { valueAsNumber: false })}
                    placeholder="0"
                    aria-invalid={Boolean(lineErrors.gstRate)}
                  />
                </Field>
                <Field label="GST amount" hint="Taxable × GST rate">
                  <ReadOnlyMoney
                    label={`Line ${index + 1} GST amount`}
                    value={totals.gstAmount}
                  />
                </Field>
              </div>

              {/* Row 2 — what the customer owes, and how much has been settled. */}
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
                <Field label="HSN Code" error={lineErrors.hsnCode?.message}>
                  <Input
                    {...register(`lines.${index}.hsnCode` as const)}
                    placeholder="e.g. 2106"
                    maxLength={8}
                    aria-invalid={Boolean(lineErrors.hsnCode)}
                  />
                </Field>
                <Field label="Freight" error={lineErrors.freightAmount?.message} hint="Added after GST">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    {...register(`lines.${index}.freightAmount` as const, { valueAsNumber: false })}
                    placeholder="0"
                    aria-invalid={Boolean(lineErrors.freightAmount)}
                  />
                </Field>
                <Field label="Invoice amount" hint="Taxable + GST + freight">
                  <ReadOnlyMoney
                    label={`Line ${index + 1} invoice amount`}
                    value={totals.invoiceAmount}
                    emphasis
                  />
                </Field>
                <Field label="Advance received" error={lineErrors.advanceAmount?.message} hint="Already paid">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    {...register(`lines.${index}.advanceAmount` as const, { valueAsNumber: false })}
                    placeholder="0"
                    aria-invalid={Boolean(lineErrors.advanceAmount)}
                  />
                </Field>
                <Field label="Amount paid" required error={lineErrors.amountPaid?.message} hint="Incl. advance">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    {...register(`lines.${index}.amountPaid` as const, { valueAsNumber: false })}
                    aria-invalid={Boolean(lineErrors.amountPaid)}
                  />
                </Field>
              </div>

              {/* Row 3 — settlement: outstanding, and how much of it is only
                  promised. Uncovered is the part with nothing behind it. */}
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
                <Field label="Balance due" hint="Invoice amount − paid">
                  <ReadOnlyMoney
                    label={`Line ${index + 1} balance due`}
                    value={totals.balanceAmount}
                  />
                </Field>
                <Field label="PDC (post-dated cheque)" error={lineErrors.pdcAmount?.message} hint="Promised, not paid">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    {...register(`lines.${index}.pdcAmount` as const, { valueAsNumber: false })}
                    placeholder="0"
                    aria-invalid={Boolean(lineErrors.pdcAmount)}
                  />
                </Field>
                <Field label="Uncovered" hint="Balance − PDC">
                  <ReadOnlyMoney
                    label={`Line ${index + 1} uncovered amount`}
                    value={totals.uncoveredAmount}
                    tone={totals.uncoveredAmount.greaterThan(0) ? 'warn' : 'muted'}
                  />
                </Field>
                <Field label="Payment Mode" error={lineErrors.paymentMode?.message}>
                  <select
                    {...register(`lines.${index}.paymentMode` as const)}
                    aria-invalid={Boolean(lineErrors.paymentMode)}
                    className="h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                  >
                    <option value="">Select mode…</option>
                    <option value="CASH">Cash</option>
                    <option value="BANK_TRANSFER">Bank Transfer</option>
                    <option value="PDC">PDC</option>
                    <option value="ON_DELIVERY">On Delivery</option>
                    <option value="CREDIT">Credit</option>
                  </select>
                </Field>
                <Field label="Lead time (days)" error={lineErrors.leadTimeDays?.message}>
                  <Input
                    type="number"
                    step="1"
                    min="0"
                    inputMode="numeric"
                    {...register(`lines.${index}.leadTimeDays` as const, { valueAsNumber: false })}
                    placeholder="0"
                    aria-invalid={Boolean(lineErrors.leadTimeDays)}
                  />
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Purchase Order No." error={lineErrors.purchaseOrderNo?.message}>
                  <Input
                    {...register(`lines.${index}.purchaseOrderNo` as const)}
                    placeholder="PO-12345"
                    maxLength={50}
                    aria-invalid={Boolean(lineErrors.purchaseOrderNo)}
                  />
                </Field>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <label htmlFor={`lines.${index}.paymentStatus`} className="text-sm text-white/70">
                  Payment status
                </label>
                <select
                  id={`lines.${index}.paymentStatus`}
                  value={line?.paymentStatus ?? 'PENDING'}
                  onChange={(event) => onStatusChange(index, event.target.value as PaymentStatus)}
                  aria-invalid={Boolean(lineErrors.paymentStatus)}
                  className="h-9 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                >
                  {(Object.keys(PAYMENT_STATUS_LABEL) as PaymentStatus[]).map((status) => (
                    <option key={status} value={status}>
                      {PAYMENT_STATUS_LABEL[status]}
                    </option>
                  ))}
                </select>
                {lineErrors.paymentStatus && (
                  <span className="text-xs text-red-400">{lineErrors.paymentStatus.message}</span>
                )}
                {totals.paymentStatus !== line?.paymentStatus && (
                  <span className="text-xs text-amber-300/80">
                    Invoice amount and amount paid imply &ldquo;
                    {PAYMENT_STATUS_LABEL[totals.paymentStatus]}&rdquo;.
                  </span>
                )}
                <span className="sm:ml-auto">
                  <Badge variant={STATUS_VARIANT[line?.paymentStatus ?? 'PENDING']}>
                    {PAYMENT_STATUS_LABEL[line?.paymentStatus ?? 'PENDING']}
                  </Badge>
                </span>
              </div>
            </div>
          )
        })}

        {typeof errors.lines?.message === 'string' && (
          <p className="text-xs text-red-400">{errors.lines.message}</p>
        )}

        {/* Invoice summary, in the order an invoice is totalled: taxable -> GST ->
              freight -> invoice amount -> paid -> balance -> PDC -> uncovered. */}
        <div className="space-y-2 border-t border-white/[0.06] pt-3">
          <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-sm">
            <SummaryLine label="Taxable value" value={invoiceTotals.taxable} muted />
            <SummaryLine label="GST" value={invoiceTotals.gst} muted />
            <SummaryLine label="Freight" value={invoiceTotals.freight} muted />
            <SummaryLine label="Invoice total" value={invoiceTotals.invoice} />
            <SummaryLine label="Advance received" value={invoiceTotals.advance} tone="emerald" />
            <SummaryLine label="Paid" value={invoiceTotals.paid} tone="emerald" />
            <SummaryLine label="Balance due" value={invoiceTotals.balance} tone="amber" />
            <SummaryLine label="PDC promised" value={invoiceTotals.pdc} muted />
            <SummaryLine
              label="Uncovered"
              value={invoiceTotals.uncovered}
              tone={invoiceTotals.uncovered.greaterThan(0) ? 'amber' : undefined}
            />
          </div>
          <p className="text-right text-xs text-white/35">
            Balance due is invoice total minus paid. Uncovered is what is still
            owed with no cheque promised against it.
          </p>
        </div>
      </Card>

      <div className="flex items-center gap-3">
        <Button type="submit" loading={isSubmitting} disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : isEdit ? 'Save changes' : 'Record sale'}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.push('/sales-tracking')}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

/**
 * Read-only money cell. Used for every derived figure on the form so the
 * computed values all look identical and never sit in a tab order.
 */
function ReadOnlyMoney({
  label,
  value,
  emphasis = false,
  tone = 'muted',
}: {
  label: string
  value: PrismaNS.Decimal
  emphasis?: boolean
  tone?: 'muted' | 'warn'
}) {
  return (
    <Input
      readOnly
      tabIndex={-1}
      value={value.toFixed(2)}
      aria-label={label}
      className={cn(
        'tabular-nums',
        emphasis ? 'font-semibold text-white' : 'text-white/70',
        tone === 'warn' ? 'text-amber-300' : null
      )}
    />
  )
}

/** One `Label  value` pair in the invoice summary strip. */
function SummaryLine({
  label,
  value,
  muted = false,
  tone,
}: {
  label: string
  value: PrismaNS.Decimal
  muted?: boolean
  tone?: 'emerald' | 'amber'
}) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="text-white/50">{label}</span>
      <span
        className={cn(
          'font-semibold tabular-nums',
          muted ? 'text-white/70' : tone === 'emerald' ? 'text-emerald-300' : tone === 'amber' ? 'text-amber-300' : 'text-white'
        )}
      >
        {formatCurrency(value.toNumber())}
      </span>
    </span>
  )
}

function Field({
  label,
  hint,
  error,
  required,
  children,
}: {
  label: string
  hint?: string
  error?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm text-white/70">
        {label}
        {required && <span className="text-red-400"> *</span>}
      </label>
      {children}
      {hint && !error && <span className="block text-xs text-white/35">{hint}</span>}
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  )
}
