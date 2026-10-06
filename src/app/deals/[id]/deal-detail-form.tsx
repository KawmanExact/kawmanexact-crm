'use client'

import { useActionState, useEffect, useMemo, useState, useTransition } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import type { DealDetail } from '@/services/deal.service'
import type { DealStage } from '@/types/crm'
import { SEGMENTS, SEGMENT_LABEL } from '@/types/crm'
import type { UserOption } from '@/services/user.service'
import { computeLineTotal } from '@/lib/sales-money'
import { updateDealAction, deleteDealAction, getDealLineItemOptions, type DealFormState, type DealProductOption } from '../actions'
import { ProductDropdown } from '@/components/crm/product-dropdown'
import { NativeSelect } from '@/components/ui/select'
import {
  CDA_STATUS_OPTIONS,
  SAMPLING_STATUS_OPTIONS,
  RD_FEEDBACK_OPTIONS,
  GRADE_OPTIONS,
  LOA_STATUS_OPTIONS,
  SOURCE_OPTIONS,
  MEETING_MODE_OPTIONS,
  APPLICATION_OPTIONS,
  APPLICATION_OTHER,
} from '@/lib/lead-dropdown-options'

const STAGES: DealStage[] = ['SUSPECT', 'PROSPECT', 'APPROACH_ANALYSE', 'NEGOTIATE', 'CLOSE', 'ORDER', 'PAYMENT', 'LOST']
const initialState: DealFormState = {}

const inputClass =
  'h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50'
const textareaClass =
  'w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-purple-500/50'

interface LineItemRow {
  id: string
  productId: string
  quantity: string
  unitPrice: string
  unitCost: string
}

function makeRow(): LineItemRow {
  return {
    id: `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    productId: '',
    quantity: '',
    unitPrice: '',
    unitCost: '',
  }
}

function mergeProductOptions(products: DealProductOption[], items: DealDetail['items']): DealProductOption[] {
  const byId = new Map(products.map((p) => [p.id, p]))
  const merged = [...products]
  for (const it of items ?? []) {
    if (it.productId && !byId.has(it.productId)) {
      const opt: DealProductOption = {
        id: it.productId,
        label: it.productName ?? 'Unknown product',
        unit: it.unit ?? 'kg',
        defaultUnitPrice: it.defaultUnitPrice ?? (it.unitPrice ?? null),
        unitPrice: it.unitPrice ?? null,
        unitCost: it.unitCost ?? null,
      }
      byId.set(it.productId, opt)
      merged.push(opt)
    }
  }
  return merged
}

function LineItemsEditor({
  products,
  initialRows,
}: {
  products: DealProductOption[]
  initialRows?: LineItemRow[]
}) {
  const [rows, setRows] = useState<LineItemRow[]>(() => (initialRows && initialRows.length > 0 ? initialRows : [makeRow()]))

  function updateRow(id: string, patch: Partial<LineItemRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }
  function addRow() {
    setRows((prev) => [...prev, makeRow()])
  }
  function removeRow(id: string) {
    setRows((prev) => (prev.length === 1 ? prev : prev.filter((r) => r.id !== id)))
  }
  function onProductChange(id: string, value: string) {
    const opt = products.find((p) => p.id === value)
    updateRow(id, {
      productId: value,
      unitPrice: String(opt?.defaultUnitPrice ?? opt?.unitPrice ?? ''),
      unitCost: String(opt?.unitCost ?? ''),
    })
  }

  const active = rows.filter((r) => r.productId && Number(r.quantity) > 0)
  const lineItemsJson = JSON.stringify(
    active.map((r) => ({
      productId: r.productId,
      quantity: Number(r.quantity),
      unitPrice: Number(r.unitPrice),
      unitCost: Number(r.unitCost),
    }))
  )
  const itemsTotal = active.reduce(
    (sum, r) => sum + computeLineTotal(Number(r.quantity), Number(r.unitPrice)).toNumber(),
    0
  )

  return (
    <div className="sm:col-span-2">
      <input type="hidden" name="lineItems" value={lineItemsJson} readOnly tabIndex={-1} />
      <div className="flex items-center justify-between gap-3">
        <label className="text-sm font-medium text-white/80">Line items</label>
        {itemsTotal > 0 && (
          <span className="text-sm text-white/50">
            Items total: <span className="font-medium text-white">{itemsTotal}</span>
          </span>
        )}
      </div>
      <p className="mt-0.5 text-xs text-white/40">
        Add products to this deal. The deal value is computed from these lines when present.
      </p>
      <div className="mt-3 space-y-3">
        {rows.map((row, index) => {
          const opt = products.find((p) => p.id === row.productId)
          return (
            <div key={row.id} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <span className="text-xs font-medium uppercase tracking-wider text-white/35">Line {index + 1}</span>
                {rows.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-red-400 hover:text-red-300"
                    aria-label={`Remove line ${index + 1}`}
                    onClick={() => removeRow(row.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1.5 lg:col-span-2">
                  <label htmlFor={`li-product-${row.id}`} className="text-sm text-white/70">
                    Product
                  </label>
                  <select
                    id={`li-product-${row.id}`}
                    value={row.productId}
                    onChange={(e) => onProductChange(row.id, e.target.value)}
                    disabled={products.length === 0}
                    className={`${inputClass} disabled:opacity-60`}
                  >
                    <option value="">Select a product…</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor={`li-qty-${row.id}`} className="text-sm text-white/70">
                    Quantity ({opt?.unit ?? 'kg'})
                  </label>
                  <Input
                    id={`li-qty-${row.id}`}
                    type="number"
                    step="0.001"
                    min="0"
                    inputMode="decimal"
                    placeholder="1"
                    value={row.quantity}
                    onChange={(e) => updateRow(row.id, { quantity: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor={`li-price-${row.id}`} className="text-sm text-white/70">
                    Unit price (₹)
                  </label>
                  <Input
                    id={`li-price-${row.id}`}
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    placeholder={String(opt?.defaultUnitPrice ?? opt?.unitPrice ?? '')}
                    value={row.unitPrice}
                    onChange={(e) => updateRow(row.id, { unitPrice: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor={`li-cost-${row.id}`} className="text-sm text-white/70">
                    Unit cost (₹)
                  </label>
                  <Input
                    id={`li-cost-${row.id}`}
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    placeholder={String(opt?.unitCost ?? '')}
                    value={row.unitCost}
                    onChange={(e) => updateRow(row.id, { unitCost: e.target.value })}
                  />
                </div>
              </div>
            </div>
          )
        })}
      </div>
      <div className="mt-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={addRow}
          disabled={products.length === 0}
        >
          <Plus className="h-3.5 w-3.5" /> Add another line
        </Button>
      </div>
    </div>
  )
}

/**
 * The deal detail form is the old lead detail form plus the pipeline block.
 * Every field the lead form collected is here, because a deal IS the lead —
 * there is no separate lead record left to keep in sync.
 */
export function DealDetailForm({
  deal,
  owners,
  canAssign,
  currentUser,
}: {
  deal: DealDetail
  owners: UserOption[]
  canAssign: boolean
  currentUser: UserOption
}) {
  const router = useRouter()
  const [deleting, startDelete] = useTransition()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const boundUpdate = updateDealAction.bind(null, deal.id)
  const [state, formAction, pending] = useActionState(boundUpdate, initialState)
  const [products, setProducts] = useState<DealProductOption[]>([])
  const dropdownOptions = useMemo(() => mergeProductOptions(products, deal.items ?? []), [products, deal.items])

  useEffect(() => {
    getDealLineItemOptions().then(setProducts).catch(() => setProducts([]))
  }, [])

  useEffect(() => {
    if (state.error) toast.error(state.error)
    if (state.success) toast.success('Deal updated')
  }, [state.error, state.success])

  const initialRows: LineItemRow[] = useMemo(
    () =>
      (deal.items ?? []).map((it) => ({
        id: `i_${it.id}`,
        productId: it.productId ?? '',
        quantity: it.quantity != null ? String(it.quantity) : '',
        unitPrice: it.unitPrice != null ? String(it.unitPrice) : '',
        unitCost: it.unitCost != null ? String(it.unitCost) : '',
      })),
    [deal.items]
  )

  function handleDelete() {
    startDelete(async () => {
      const res = await deleteDealAction(deal.id)
      if (res?.error) toast.error(res.error)
      else if (res?.success) {
        toast.success('Deal deleted')
        router.push('/deals')
      }
    })
  }

  return (
    <form action={formAction} className="space-y-6">
      <Card className="bg-[#0a111c]/80 border-white/[0.08] p-5 space-y-4">
        <h2 className="text-sm font-medium text-white/80">Pipeline</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Value (₹)" error={state.fieldErrors?.value}>
            <Input name="value" type="number" min={0} defaultValue={deal.value} />
          </Field>
          <Field label="Stage" error={state.fieldErrors?.stage}>
            <select name="stage" defaultValue={deal.stage} className={inputClass}>
              {STAGES.map((s) => (
                <option key={s} value={s}>
                  {s === 'APPROACH_ANALYSE' ? 'APPROACH & ANALYSE' : s}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Probability (%)" error={state.fieldErrors?.probability}>
            <Input name="probability" type="number" min={0} max={100} defaultValue={deal.probability} />
          </Field>
          <Field label="Expected close">
            <Input name="expectedClose" type="date" defaultValue={deal.expectedClose} />
          </Field>
          {(deal.stage === 'ORDER' || deal.stage === 'PAYMENT') && (
            <Field label="Payment Status">
              <select name="paymentStatus" defaultValue={deal.paymentStatus ?? 'PENDING'} className={inputClass}>
                <option value="PENDING">Payment Pending</option>
                <option value="PARTIALLY_PAID">Partially Paid</option>
                <option value="PAID">Paid</option>
              </select>
            </Field>
          )}
          {deal.stage === 'LOST' && (
            <Field label="Lost Reason" error={state.fieldErrors?.lostReason}>
              <Input name="lostReason" defaultValue={deal.lostReason ?? ''} placeholder="Price too high, Competitor selected, etc." />
            </Field>
          )}
          <Field label="Priority">
            <select name="priority" defaultValue={deal.priority} className={inputClass}>
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
            </select>
          </Field>
          <Field label="Score (0-100)" error={state.fieldErrors?.score}>
            <Input name="score" type="number" min={0} max={100} defaultValue={deal.score} />
          </Field>
        </div>
      </Card>

      <Card className="bg-[#0a111c]/80 border-white/[0.08] p-5 space-y-4">
        <h2 className="text-sm font-medium text-white/80">Core</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Deal / lead name *" error={state.fieldErrors?.name}>
            <Input name="name" defaultValue={deal.name} required />
          </Field>
          <Field label="Company" error={state.fieldErrors?.company}>
            <Input name="company" defaultValue={deal.company === '—' ? '' : deal.company} />
          </Field>
          <Field label="Source" error={state.fieldErrors?.source}>
            <NativeSelect
              name="source"
              defaultValue={deal.source === '—' ? '' : deal.source}
              placeholder="Select source"
              error={state.fieldErrors?.source}
            >
              {SOURCE_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Owner">
            {canAssign ? (
              <select name="ownerId" defaultValue={deal.ownerId} className={inputClass}>
                {owners.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            ) : (
              <>
                <input type="hidden" name="ownerId" value={currentUser.id} />
                <select
                  name="ownerId"
                  defaultValue={currentUser.id}
                  disabled
                  className={`${inputClass} text-white/50 cursor-not-allowed`}
                >
                  <option value={currentUser.id}>{currentUser.name} (you)</option>
                </select>
              </>
            )}
          </Field>
          <div className="sm:col-span-2 space-y-1.5">
            <label className="text-sm text-white/70">Notes</label>
            <textarea name="notes" rows={3} className={textareaClass} defaultValue={deal.notes} />
          </div>
        </div>
      </Card>

      <Card className="bg-[#0a111c]/80 border-white/[0.08] p-5 space-y-4">
        <h2 className="text-sm font-medium text-white/80">Contact</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Contact person" error={state.fieldErrors?.contactPerson}>
            <Input
              name="contactName"
              defaultValue={deal.contactPerson ?? (deal.contact === '—' ? '' : deal.contact)}
            />
          </Field>
          <Field label="Designation" error={state.fieldErrors?.designation}>
            <Input name="designation" defaultValue={deal.designation ?? ''} />
          </Field>
          <Field label="Email" error={state.fieldErrors?.email}>
            <Input name="email" type="email" defaultValue={deal.email} />
          </Field>
          <Field label="Phone" error={state.fieldErrors?.phone}>
            <Input name="phone" defaultValue={deal.phone} />
          </Field>
        </div>
      </Card>

      <Card className="bg-[#0a111c]/80 border-white/[0.08] p-5 space-y-4">
        <h2 className="text-sm font-medium text-white/80">Meeting</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Date" error={state.fieldErrors?.meetingDate}>
            <Input name="meetingDate" type="date" defaultValue={deal.meetingDate ?? ''} />
          </Field>
          <Field label="Meeting Mode" error={state.fieldErrors?.meetingMode}>
            <NativeSelect
              name="meetingMode"
              defaultValue={deal.meetingMode ?? ''}
              placeholder="Select meeting mode"
              error={state.fieldErrors?.meetingMode}
            >
              {MEETING_MODE_OPTIONS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="City" error={state.fieldErrors?.city}>
            <Input name="city" defaultValue={deal.city ?? ''} />
          </Field>
          <Field label="Country" error={state.fieldErrors?.country}>
            <Input name="country" defaultValue={deal.country ?? ''} />
          </Field>
          <Field label="Pin Code" error={state.fieldErrors?.pinCode}>
            <Input name="pinCode" defaultValue={deal.pinCode ?? ''} />
          </Field>
          <div className="sm:col-span-2 space-y-1.5">
            <label className="text-sm text-white/70">Purpose of Visit</label>
            <textarea
              name="purposeOfVisit"
              rows={2}
              className={textareaClass}
              defaultValue={deal.purposeOfVisit ?? ''}
            />
          </div>
        </div>
      </Card>

      <Card className="bg-[#0a111c]/80 border-white/[0.08] p-5 space-y-4">
        <h2 className="text-sm font-medium text-white/80">Products & Requirement</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2 space-y-1.5">
            <ProductDropdown
              name="productsDiscussed"
              defaultValue={deal.productsDiscussed ?? []}
              defaultCustomProductNames={deal.customProductNames ?? []}
              label="Products Discussed"
              error={state.fieldErrors?.productsDiscussed}
              placeholder="Select products..."
            />
          </div>
          <div className="sm:col-span-2 space-y-1.5">
            <label className="text-sm text-white/70">Key Discussion Points</label>
            <textarea
              name="keyDiscussion"
              rows={2}
              className={textareaClass}
              defaultValue={deal.keyDiscussion ?? ''}
            />
          </div>
          <div className="sm:col-span-2 space-y-1.5">
            <label className="text-sm text-white/70">Customer Requirement</label>
            <textarea
              name="requirement"
              rows={2}
              className={textareaClass}
              defaultValue={deal.requirement ?? ''}
            />
          </div>
          <Field label="Grade" error={state.fieldErrors?.grade}>
            <NativeSelect name="grade" defaultValue={deal.grade ?? ''} placeholder="Select grade" error={state.fieldErrors?.grade}>
              {GRADE_OPTIONS.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Application" error={state.fieldErrors?.application}>
            <NativeSelect name="application" defaultValue={deal.application ?? ''} placeholder="Select application" error={state.fieldErrors?.application} className={`${inputClass} [color-scheme:dark]`}>
              {APPLICATION_OPTIONS.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
              <option value={APPLICATION_OTHER}>{APPLICATION_OTHER}</option>
            </NativeSelect>
          </Field>
          {deal.application === APPLICATION_OTHER && (
            <Field label="Specify Application" error={state.fieldErrors?.applicationOther}>
              <Input name="applicationOther" defaultValue={deal.applicationOther ?? ''} placeholder="Specify application" required />
            </Field>
          )}
          <Field label="CDA Status" error={state.fieldErrors?.cdaStatus}>
            <NativeSelect name="cdaStatus" defaultValue={deal.cdaStatus ?? ''} placeholder="Select CDA status" error={state.fieldErrors?.cdaStatus}>
              {CDA_STATUS_OPTIONS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Sampling Status" error={state.fieldErrors?.samplingStatus}>
            <NativeSelect name="samplingStatus" defaultValue={deal.samplingStatus ?? ''} placeholder="Select sampling status" error={state.fieldErrors?.samplingStatus}>
              {SAMPLING_STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="R&D Feedback" error={state.fieldErrors?.rdFeedback}>
            <NativeSelect name="rdFeedback" defaultValue={deal.rdFeedback ?? ''} placeholder="Select R&D feedback" error={state.fieldErrors?.rdFeedback}>
              {RD_FEEDBACK_OPTIONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </NativeSelect>
          </Field>
          <LineItemsEditor products={dropdownOptions} initialRows={initialRows} />
          {state.fieldErrors?.lineItems && (
            <div className="sm:col-span-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {state.fieldErrors.lineItems}
            </div>
          )}
        </div>
      </Card>

      <Card className="bg-[#0a111c]/80 border-white/[0.08] p-5 space-y-4">
        <h2 className="text-sm font-medium text-white/80">Tracking</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2 space-y-1.5">
            <label className="text-sm text-white/70">Remark</label>
            <textarea name="remark" rows={2} className={textareaClass} defaultValue={deal.remark ?? ''} />
          </div>
          <Field label="Next Follow-up" error={state.fieldErrors?.nextFollowUp}>
            <Input name="nextFollowUp" type="date" defaultValue={deal.nextFollowUp ?? ''} />
          </Field>
          <Field label="LOA Status" error={state.fieldErrors?.loaStatus}>
            <NativeSelect name="loaStatus" defaultValue={deal.loaStatus ?? ''} placeholder="Select LOA status" error={state.fieldErrors?.loaStatus}>
              {LOA_STATUS_OPTIONS.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </NativeSelect>
          </Field>
        </div>
      </Card>

      {state.error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {state.error}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-white/40">Owned by {deal.owner}</span>
        <div className="flex items-center gap-2">
          <Button type="button" variant="destructive" size="sm" onClick={() => setConfirmOpen(true)} disabled={deleting}>
            {deleting ? 'Deleting…' : 'Delete deal'}
          </Button>
          <Button type="submit" size="sm" loading={pending} disabled={pending}>
            {pending ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Delete "${deal.name}"?`}
        description="This cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        loading={deleting}
        onConfirm={handleDelete}
      />
    </form>
  )
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm text-white/70">{label}</label>
      {children}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}