'use client'

import { useActionState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createCompanyAction, type CompanyFormState } from '../actions'
import type { UserOption } from '@/services/user.service'

const initialState: CompanyFormState = {}

export function CompanyForm({ owners, canAssign, currentUser }: { owners: UserOption[]; canAssign: boolean; currentUser: UserOption }) {
  const [state, formAction, pending] = useActionState(createCompanyAction, initialState)
  const router = useRouter()
  useEffect(() => {
    if (state.error) toast.error(state.error)
    if (state.success && state.createdId) {
      toast.success('Company created')
      router.push(`/companies/${state.createdId}`)
    }
  }, [state.error, state.success, state.createdId, router])

  return (
    <Card className="bg-[#0a111c]/80 border-white/[0.08] p-6">
      <form action={formAction} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Company name *" error={state.fieldErrors?.name}>
          <Input name="name" placeholder="Acme Nutraceuticals Pvt. Ltd." required />
        </Field>
        <Field label="Industry" error={state.fieldErrors?.industry}>
          <Input name="industry" placeholder="Nutraceuticals" />
        </Field>
        <Field label="Website" error={state.fieldErrors?.website}>
          <Input name="website" placeholder="https://acme.com" />
        </Field>
        <Field label="Phone" error={state.fieldErrors?.phone}>
          <Input name="phone" placeholder="+91 22 4000 1000" />
        </Field>
        <Field label="Email" error={state.fieldErrors?.email}>
          <Input name="email" type="email" placeholder="contact@acme.com" />
        </Field>
        <Field label="City" error={state.fieldErrors?.city}>
          <Input name="city" placeholder="Mumbai" />
        </Field>
        <Field label="State" error={state.fieldErrors?.state}>
          <Input name="state" placeholder="Maharashtra" />
        </Field>
        <Field label="Employees" error={state.fieldErrors?.employees}>
          <Input name="employees" type="number" min={0} placeholder="150" />
        </Field>
        <Field label="Annual revenue (₹)" error={state.fieldErrors?.revenue}>
          <Input name="revenue" type="number" min={0} step="10000" placeholder="50000000" />
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
                className="h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white/50 cursor-not-allowed"
              >
                <option value={currentUser.id}>{currentUser.name} (you)</option>
              </select>
            </>
          )}
        </Field>

        {state.error && (
          <div className="sm:col-span-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {state.error}
          </div>
        )}

        <div className="sm:col-span-2 flex justify-end">
          <Button type="submit" loading={pending} disabled={pending}>
            {pending ? 'Creating…' : 'Create company'}
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
