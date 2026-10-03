'use client'

import { useActionState, useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import type { CompanyDetail } from '@/services/company.service'
import type { UserOption } from '@/services/user.service'
import { updateCompanyAction, deleteCompanyAction, type CompanyFormState } from '../actions'

const initialState: CompanyFormState = {}

export function CompanyDetailForm({ company, owners, canAssign, currentUser }: { company: CompanyDetail; owners: UserOption[]; canAssign: boolean; currentUser: UserOption }) {
  const router = useRouter()
  const [deleting, startDelete] = useTransition()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const boundUpdate = updateCompanyAction.bind(null, company.id)
  const [state, formAction, pending] = useActionState(boundUpdate, initialState)
  useEffect(() => {
    if (state.error) toast.error(state.error)
    if (state.success) toast.success('Company updated')
  }, [state.error, state.success])

  function handleDelete() {
    startDelete(async () => {
      const res = await deleteCompanyAction(company.id)
      if (res?.error) toast.error(res.error)
      else if (res?.success) {
        toast.success('Company deleted')
        router.push('/companies')
      }
    })
  }

  return (
    <Card className="bg-[#0a111c]/80 border-white/[0.08] p-6 space-y-4">
      <form action={formAction} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Company name *">
          <Input name="name" defaultValue={company.name} required />
        </Field>
        <Field label="Industry">
          <Input name="industry" defaultValue={company.industry === '—' ? '' : company.industry} />
        </Field>
        <Field label="Website">
          <Input name="website" defaultValue={company.website} />
        </Field>
        <Field label="Phone">
          <Input name="phone" defaultValue={company.phone} />
        </Field>
        <Field label="Email">
          <Input name="email" type="email" defaultValue={company.email} />
        </Field>
        <Field label="City">
          <Input name="city" defaultValue={company.city} />
        </Field>
        <Field label="State">
          <Input name="state" defaultValue={company.state} />
        </Field>
        <Field label="Employees">
          <Input name="employees" type="number" min={0} defaultValue={company.employees || ''} />
        </Field>
        <Field label="Revenue (₹)">
          <Input name="revenue" type="number" min={0} defaultValue={company.revenue || ''} />
        </Field>
        <Field label="Owner">
          {canAssign ? (
            <select
              name="ownerId"
              defaultValue={company.ownerId}
              className="h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
            >
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

        {state.error && (
          <div className="sm:col-span-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {state.error}
          </div>
        )}

        <div className="sm:col-span-2 flex justify-end">
          <Button type="submit" size="sm" loading={pending} disabled={pending}>
            {pending ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-white/[0.06]">
        <span className="text-xs text-white/40">Tracked since {new Date(company.createdAt).toLocaleDateString('en-IN')}</span>
        <Button type="button" variant="destructive" size="sm" onClick={() => setConfirmOpen(true)} disabled={deleting}>
          {deleting ? 'Deleting…' : 'Delete company'}
        </Button>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Delete "${company.name}"?`}
        description="This cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        loading={deleting}
        onConfirm={handleDelete}
      />
    </Card>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm text-white/70">{label}</label>
      {children}
    </div>
  )
}
