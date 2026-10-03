'use client'

import { useActionState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createLeadAction, type LeadFormState } from '../actions'
import type { UserOption } from '@/services/user.service'
import { SEGMENTS, SEGMENT_LABEL } from '@/types/crm'

const initialState: LeadFormState = {}

const LEAD_SOURCES = ['Website', 'Referral', 'Trade Show', 'Cold Call', 'Email Campaign', 'Social Media', 'Other']

export function LeadForm({ owners, canAssign, currentUser }: { owners: UserOption[]; canAssign: boolean; currentUser: UserOption }) {
  const [state, formAction, pending] = useActionState(createLeadAction, initialState)
  const router = useRouter()
  useEffect(() => {
    if (state.error) toast.error(state.error)
    if (state.success && state.createdId) {
      toast.success('Lead created')
      router.push(`/leads/${state.createdId}`)
    }
  }, [state.error, state.success, state.createdId, router])

  return (
    <Card className="bg-[#0a111c]/80 border-white/[0.08] p-6">
      <form action={formAction} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Lead name *" error={state.fieldErrors?.name}>
          <Input name="name" placeholder="Rahul Sharma" required />
        </Field>

        <Field label="Company" error={state.fieldErrors?.company}>
          <Input name="company" placeholder="Acme Nutraceuticals" />
        </Field>

        <Field label="Email" error={state.fieldErrors?.email}>
          <Input name="email" type="email" placeholder="rahul@acme.com" />
        </Field>

        <Field label="Phone" error={state.fieldErrors?.phone}>
          <Input name="phone" placeholder="+91 98765 43210" />
        </Field>

        <Field label="Source" error={state.fieldErrors?.source}>
          <select
            name="source"
            defaultValue="Website"
            className="h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
          >
            {LEAD_SOURCES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Segment" error={state.fieldErrors?.segment}>
          <select
            name="segment"
            defaultValue=""
            className="h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
          >
            <option value="">Select segment</option>
            {SEGMENTS.map((s) => (
              <option key={s} value={s}>
                {SEGMENT_LABEL[s]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Owner" error={state.fieldErrors?.ownerId}>
          {canAssign ? (
            <select
              name="ownerId"
              defaultValue=""
              className="h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
            >
              <option value="">Assign to me</option>
              {owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          ) : (
            <>
              <input type="hidden" name="ownerId" value={currentUser.id} />
              <select
                name="ownerId"
                defaultValue={currentUser.id}
                disabled
                className="h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white/50 cursor-not-allowed"
              >
                <option value={currentUser.id}>{currentUser.name} (you)</option>
              </select>
            </>
          )}
        </Field>

        <Field label="Score (0-100)" error={state.fieldErrors?.score}>
          <Input name="score" type="number" min={0} max={100} defaultValue={0} />
        </Field>

        <Field label="Estimated value (₹)" error={state.fieldErrors?.value}>
          <Input name="value" type="number" min={0} step="1000" placeholder="500000" />
        </Field>

        <div className="sm:col-span-2 space-y-1.5">
          <label className="text-sm text-white/70">Notes</label>
          <textarea
            name="notes"
            rows={3}
            className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
            placeholder="Any context about this lead..."
          />
        </div>

        {state.error && (
          <div className="sm:col-span-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {state.error}
          </div>
        )}

        <div className="sm:col-span-2 flex justify-end gap-3">
          <Button type="submit" loading={pending} disabled={pending}>
            {pending ? 'Creating…' : 'Create lead'}
          </Button>
        </div>
      </form>
    </Card>
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
