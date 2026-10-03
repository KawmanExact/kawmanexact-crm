'use client'

import { useActionState, useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import type { ContactDetail } from '@/services/contact.service'
import type { UserOption } from '@/services/user.service'
import { SEGMENTS, SEGMENT_LABEL } from '@/types/crm'
import { updateContactAction, deleteContactAction, type ContactFormState } from '../actions'

const initialState: ContactFormState = {}

export function ContactDetailForm({
  contact,
  owners,
  canAssign,
  currentUser,
}: {
  contact: ContactDetail
  owners: UserOption[]
  canAssign: boolean
  currentUser: UserOption
}) {
  const router = useRouter()
  const [deleting, startDelete] = useTransition()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const boundUpdate = updateContactAction.bind(null, contact.id)
  const [state, formAction, pending] = useActionState(boundUpdate, initialState)
  useEffect(() => {
    if (state.error) toast.error(state.error)
    if (state.success) toast.success('Contact updated')
  }, [state.error, state.success])

  function handleDelete() {
    startDelete(async () => {
      const res = await deleteContactAction(contact.id)
      if (res?.error) toast.error(res.error)
      else if (res?.success) {
        toast.success('Contact deleted')
        router.push('/contacts')
      }
    })
  }

  return (
    <Card className="bg-[#0a111c]/80 border-white/[0.08] p-6 space-y-4">
      <form action={formAction} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Full name *" error={state.fieldErrors?.name}>
          <Input name="name" defaultValue={contact.name} required />
        </Field>
        <Field label="Company" error={state.fieldErrors?.company}>
          <Input name="company" defaultValue={contact.company === '—' ? '' : contact.company} placeholder="Acme Nutraceuticals" />
        </Field>
        <Field label="Designation" error={state.fieldErrors?.designation}>
          <Input name="designation" defaultValue={contact.designation === '—' ? '' : contact.designation} />
        </Field>
        <Field label="Email" error={state.fieldErrors?.email}>
          <Input name="email" type="email" defaultValue={contact.email} />
        </Field>
        <Field label="Phone" error={state.fieldErrors?.phone}>
          <Input name="phone" defaultValue={contact.phone} />
        </Field>
        <Field label="Mobile" error={state.fieldErrors?.mobile}>
          <Input name="mobile" defaultValue={contact.mobile} />
        </Field>
        <Field label="Address" error={state.fieldErrors?.address}>
          <Input name="address" defaultValue={contact.address} placeholder="123 Main St, City, State" />
        </Field>
        <Field label="Segment" error={state.fieldErrors?.segment}>
          <select
            name="segment"
            defaultValue={contact.segment ?? ''}
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
              defaultValue={contact.ownerId}
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
        <span className="text-xs text-white/40">
          Last activity {new Date(contact.lastActivityAt).toLocaleDateString('en-IN')}
        </span>
        <Button type="button" variant="destructive" size="sm" onClick={() => setConfirmOpen(true)} disabled={deleting}>
          {deleting ? 'Deleting…' : 'Delete contact'}
        </Button>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Delete "${contact.name}"?`}
        description="This cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        loading={deleting}
        onConfirm={handleDelete}
      />
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
