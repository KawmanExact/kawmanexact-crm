'use client'

import { useActionState, useCallback, useEffect, useState, startTransition } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createDealAction, getDealLineItemOptions, type DealFormState, type DealProductOption } from '../actions'
import type { UserOption } from '@/services/user.service'
import { SEGMENTS, SEGMENT_LABEL } from '@/types/crm'
import { computeLineTotal } from '@/lib/sales-money'
import { ProductDropdown } from '@/components/crm/product-dropdown'
import { NativeSelect } from '@/components/ui/select'
import { CompanySelect } from '@/components/crm/company-select'
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

const initialState: DealFormState = {}
const STAGES = ['SUSPECT', 'PROSPECT', 'APPROACH_ANALYSE', 'NEGOTIATE', 'CLOSE', 'ORDER', 'PAYMENT', 'LOST']

// [color-scheme:dark] makes native dropdown popups render dark, so white
// option text is readable instead of white-on-white.
const inputClass =
  'h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white placeholder:text-white/35 [color-scheme:dark] focus:outline-none focus:ring-2 focus:ring-purple-500/50'
const textareaClass =
  'w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-purple-500/50'
const optionClass = 'bg-[#0a111c] text-white'

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
})

type ProductsStatus = 'loading' | 'ready' | 'error'

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

function defaultPriceOf(opt?: DealProductOption) {
  return opt?.defaultUnitPrice ?? opt?.unitPrice ?? ''
}

function LineItemsEditor({
  products,
  status,
  onRetry,
  initialRows,
}: {
  products: DealProductOption[]
  status: ProductsStatus
  onRetry: () => void
  initialRows?: LineItemRow[]
}) {
  const [rows, setRows] = useState<LineItemRow[]>(() =>
    initialRows && initialRows.length > 0 ? initialRows : [makeRow()]
  )

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
      unitPrice: String(defaultPriceOf(opt)),
      unitCost: String(opt?.unitCost ?? ''),
    })
  }

  const active = rows.filter((r) => r.productId && Number(r.quantity) > 0)
  const incomplete = rows.filter((r) => r.productId && !(Number(r.quantity) > 0))

  const lineItemsJson = JSON.stringify(
    active.map((r) => {
      const opt = products.find((p) => p.id === r.productId)
      return {
        productId: r.productId,
        quantity: Number(r.quantity),
        unitPrice: r.unitPrice === '' ? Number(defaultPriceOf(opt) || 0) : Number(r.unitPrice),
        unitCost: r.unitCost === '' ? Number(opt?.unitCost ?? 0) : Number(r.unitCost),
      }
    })
  )
  const itemsTotal = active.reduce((sum, r) => {
    const opt = products.find((p) => p.id === r.productId)
    const price = r.unitPrice === '' ? Number(defaultPriceOf(opt) || 0) : Number(r.unitPrice)
    return sum + computeLineTotal(Number(r.quantity), price).toNumber()
  }, 0)

  return (
    <div className="sm:col-span-2">
      <input type="hidden" name="lineItems" value={lineItemsJson} readOnly tabIndex={-1} />
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-white/80">Line items</span>
        {itemsTotal > 0 && (
          <span className="text-sm text-white/50">
            Items total: <span className="font-medium text-white">{inr.format(itemsTotal)}</span>
          </span>
        )}
      </div>
      <p className="mt-0.5 text-xs text-white/40">
        Add products to this deal. The deal value is computed from these lines when present.
        {status === 'ready' && ` ${products.length} product${products.length === 1 ? '' : 's'} loaded.`}
      </p>

      {status === 'error' && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          <span>Couldn’t load products.</span>
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            Retry
          </Button>
        </div>
      )}
      {status === 'ready' && products.length === 0 && (
        <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
          No products are available to add.
        </div>
      )}
      {incomplete.length > 0 && (
        <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
          {incomplete.length === 1 ? '1 line has' : `${incomplete.length} lines have`} a product but no quantity and
          will not be saved.
        </div>
      )}

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
                    className={inputClass}
                  >
                    <option value="" className={optionClass}>
                      {status === 'loading'
                        ? 'Loading products…'
                        : status === 'error'
                          ? 'Couldn’t load products'
                          : products.length === 0
                            ? 'No products available'
                            : 'Select a product…'}
                    </option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id} className={optionClass}>
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
                    placeholder={String(defaultPriceOf(opt))}
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
        <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={addRow}>
          <Plus className="h-3.5 w-3.5" /> Add another line
        </Button>
      </div>
    </div>
  )
}

/**
 * The new-deal form IS the old lead form, with the pipeline block on top.
 * Leads and deals are one record, so there is no separate "create a lead"
 * screen — filling this form creates a deal, and it lands at SUSPECT unless the
 * stage is explicitly changed.
 */
export function DealForm({
  owners,
  canAssign,
  currentUser,
  companies = [],
}: {
  owners: UserOption[]
  canAssign: boolean
  currentUser: UserOption
  companies?: { id: string; name: string }[]
}) {
  const [state, formAction, pending] = useActionState(createDealAction, initialState)
  const router = useRouter()
  const [products, setProducts] = useState<DealProductOption[]>([])
  const [productsStatus, setProductsStatus] = useState<ProductsStatus>('loading')
  const [application, setApplication] = useState<string>('')

  const loadProducts = useCallback(() => {
    setProductsStatus('loading')
    getDealLineItemOptions()
      .then((list) => {
        setProducts(list ?? [])
        setProductsStatus('ready')
      })
      .catch((err) => {
        console.error('getDealLineItemOptions failed:', err)
        setProducts([])
        setProductsStatus('error')
      })
  }, [])

  useEffect(() => {
    loadProducts()
  }, [loadProducts])

  // Depend on the whole state object so repeated identical errors still toast.
  useEffect(() => {
    if (state.error) toast.error(state.error)
    if (state.success && state.createdId) {
      toast.success('Deal created')
      router.push(`/deals/${state.createdId}`)
    }
  }, [state, router])

  // Manual submit avoids React 19's automatic reset of uncontrolled fields
  // after the action finishes (which wiped the form on validation errors).
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(() => formAction(fd))
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card className="bg-[#0a111c]/80 border-white/[0.08] p-5 space-y-4">
        <h2 className="text-sm font-medium text-white/80">Pipeline</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Stage" error={state.fieldErrors?.stage}>
            <select name="stage" defaultValue="SUSPECT" className={inputClass}>
              {STAGES.map((s) => (
                <option key={s} value={s} className={optionClass}>
                  {s === 'APPROACH_ANALYSE' ? 'APPROACH & ANALYSE' : s}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Estimated value (₹)" error={state.fieldErrors?.value}>
            <Input name="value" type="number" min={0} step="1000" placeholder="500000" />
          </Field>
          <Field label="Probability (%)" error={state.fieldErrors?.probability}>
            <Input name="probability" type="number" min={0} max={100} defaultValue={10} />
          </Field>
          <Field label="Expected close date" error={state.fieldErrors?.expectedClose}>
            <Input name="expectedClose" type="date" />
          </Field>
          <Field label="Priority" error={state.fieldErrors?.priority}>
            <select name="priority" defaultValue="MEDIUM" className={inputClass}>
              <option value="LOW" className={optionClass}>Low</option>
              <option value="MEDIUM" className={optionClass}>Medium</option>
              <option value="HIGH" className={optionClass}>High</option>
            </select>
          </Field>
          <Field label="Owner" error={state.fieldErrors?.ownerId}>
            {canAssign ? (
              <select name="ownerId" defaultValue="" className={inputClass}>
                <option value="" className={optionClass}>Assign to me</option>
                {owners.map((o) => (
                  <option key={o.id} value={o.id} className={optionClass}>
                    {o.name}
                  </option>
                ))}
              </select>
            ) : (
              <>
                <input type="hidden" name="ownerId" value={currentUser.id} />
                <select
                  value={currentUser.id}
                  disabled
                  onChange={() => {}}
                  className={`${inputClass} text-white/50 cursor-not-allowed`}
                >
                  <option value={currentUser.id} className={optionClass}>
                    {currentUser.name} (you)
                  </option>
                </select>
              </>
            )}
          </Field>
        </div>
      </Card>

      <Card className="bg-[#0a111c]/80 border-white/[0.08] p-5 space-y-4">
        <h2 className="text-sm font-medium text-white/80">Core</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Deal / lead name *" error={state.fieldErrors?.name}>
            <Input name="name" placeholder="lead name" required />
          </Field>
          <Field label="Company" error={state.fieldErrors?.company}>
            <CompanySelect companies={companies} />
          </Field>
          <Field label="Source" error={state.fieldErrors?.source}>
            <NativeSelect name="source" defaultValue="Website" placeholder="Select source" error={state.fieldErrors?.source}>
              {SOURCE_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Segment" error={state.fieldErrors?.segment}>
            <select name="segment" defaultValue="" className={inputClass}>
              <option value="" className={optionClass}>Select segment</option>
              {SEGMENTS.map((s) => (
                <option key={s} value={s} className={optionClass}>
                  {SEGMENT_LABEL[s]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Score (0-100)" error={state.fieldErrors?.score}>
            <Input name="score" type="number" min={0} max={100} defaultValue={0} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Notes" error={state.fieldErrors?.notes}>
              <textarea name="notes" rows={3} className={textareaClass} placeholder="Any context about this enquiry..." />
            </Field>
          </div>
        </div>
      </Card>

      <Card className="bg-[#0a111c]/80 border-white/[0.08] p-5 space-y-4">
        <h2 className="text-sm font-medium text-white/80">Contact</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Contact person" error={state.fieldErrors?.contactName ?? state.fieldErrors?.contactPerson}>
            <Input name="contactName" placeholder="Jane Doe" />
          </Field>
          <Field label="Designation" error={state.fieldErrors?.designation}>
            <Input name="designation" placeholder="Purchase Manager" />
          </Field>
          <Field label="Email" error={state.fieldErrors?.email}>
            <Input name="email" type="email" placeholder="jane@acme.com" />
          </Field>
          <Field label="Phone" error={state.fieldErrors?.phone}>
            <Input name="phone" placeholder="+91 98765 43210" />
          </Field>
        </div>
      </Card>

      <Card className="bg-[#0a111c]/80 border-white/[0.08] p-5 space-y-4">
        <h2 className="text-sm font-medium text-white/80">Meeting</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Date" error={state.fieldErrors?.meetingDate}>
            <Input name="meetingDate" type="date" />
          </Field>
          <Field label="Meeting Mode" error={state.fieldErrors?.meetingMode}>
            <NativeSelect name="meetingMode" placeholder="Select meeting mode" error={state.fieldErrors?.meetingMode}>
              {MEETING_MODE_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="City" error={state.fieldErrors?.city}>
            <Input name="city" placeholder="Mumbai" />
          </Field>
          <Field label="Country" error={state.fieldErrors?.country}>
            <Input name="country" placeholder="India" />
          </Field>
          <Field label="Pin Code" error={state.fieldErrors?.pinCode}>
            <Input name="pinCode" placeholder="400001" />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Purpose of Visit" error={state.fieldErrors?.purposeOfVisit}>
              <textarea name="purposeOfVisit" rows={2} className={textareaClass} placeholder="New product demo" />
            </Field>
          </div>
        </div>
      </Card>

      <Card className="bg-[#0a111c]/80 border-white/[0.08] p-5 space-y-4">
        <h2 className="text-sm font-medium text-white/80">Products & Requirement</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2 space-y-1.5">
            <ProductDropdown
              name="productsDiscussed"
              defaultValue={[]}
              defaultCustomProductNames={[]}
              label="Products Discussed"
              error={state.fieldErrors?.productsDiscussed}
              placeholder="Select products..."
            />
          </div>
          <div className="sm:col-span-2">
            <Field label="Key Discussion Points" error={state.fieldErrors?.keyDiscussion}>
              <textarea name="keyDiscussion" rows={2} className={textareaClass} placeholder="Interested in bulk pricing" />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Customer Requirement" error={state.fieldErrors?.requirement}>
              <textarea name="requirement" rows={2} className={textareaClass} placeholder="Need samples within 2 weeks" />
            </Field>
          </div>
          <Field label="Grade" error={state.fieldErrors?.grade}>
            <NativeSelect name="grade" placeholder="Select grade" error={state.fieldErrors?.grade}>
              {GRADE_OPTIONS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Application" error={state.fieldErrors?.application}>
            <NativeSelect
              name="application"
              value={application}
              onChange={(e) => setApplication(e.target.value)}
              placeholder="Select application"
              error={state.fieldErrors?.application}
              className={`${inputClass} [color-scheme:dark]`}
            >
              {APPLICATION_OPTIONS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
              <option value={APPLICATION_OTHER}>{APPLICATION_OTHER}</option>
            </NativeSelect>
          </Field>
          {application === APPLICATION_OTHER && (
            <Field label="Specify Application" error={state.fieldErrors?.applicationOther}>
              <Input name="applicationOther" placeholder="Specify application" required />
            </Field>
          )}
          <Field label="CDA Status" error={state.fieldErrors?.cdaStatus}>
            <NativeSelect name="cdaStatus" placeholder="Select CDA status" error={state.fieldErrors?.cdaStatus}>
              {CDA_STATUS_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Sampling Status" error={state.fieldErrors?.samplingStatus}>
            <NativeSelect name="samplingStatus" placeholder="Select sampling status" error={state.fieldErrors?.samplingStatus}>
              {SAMPLING_STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="R&D Feedback" error={state.fieldErrors?.rdFeedback}>
            <NativeSelect name="rdFeedback" placeholder="Select R&D feedback" error={state.fieldErrors?.rdFeedback}>
              {RD_FEEDBACK_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </NativeSelect>
          </Field>
          
        </div>
      </Card>

      <Card className="bg-[#0a111c]/80 border-white/[0.08] p-5 space-y-4">
        <h2 className="text-sm font-medium text-white/80">Tracking</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <Field label="Remark" error={state.fieldErrors?.remark}>
              <textarea name="remark" rows={2} className={textareaClass} placeholder="Contact No.: 9326886243" />
            </Field>
          </div>
          <Field label="Next Follow-up" error={state.fieldErrors?.nextFollowUp}>
            <Input name="nextFollowUp" type="date" />
          </Field>
          <Field label="LOA Status" error={state.fieldErrors?.loaStatus}>
            <NativeSelect name="loaStatus" placeholder="Select LOA status" error={state.fieldErrors?.loaStatus}>
              {LOA_STATUS_OPTIONS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
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

      <div className="flex justify-end">
        <Button type="submit" loading={pending} disabled={pending}>
          {pending ? 'Creating…' : 'Create deal'}
        </Button>
      </div>
    </form>
  )
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block space-y-1.5">
        <span className="text-sm text-white/70">{label}</span>
        {children}
      </label>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}