'use client'

import { useActionState, useEffect, useState } from 'react'
import Link from 'next/link'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'
import { createUserAction, type UserFormState } from '../actions'

const initialState: UserFormState = {}
const ROLES = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'SALES_MANAGER', 'SALES_EXECUTIVE', 'MARKETING', 'HR', 'FINANCE', 'VIEWER']

export function NewUserForm({
  departments,
  teams,
}: {
  departments: { id: string; name: string }[]
  teams: { id: string; name: string }[]
}) {
  const [state, formAction, pending] = useActionState(createUserAction, initialState)
  useEffect(() => {
    if (state.error) toast.error(state.error)
    if (state.success || state.tempPassword) toast.success('User created')
  }, [state.error, state.success, state.tempPassword])
  const [copied, setCopied] = useState(false)

  if (state.tempPassword) {
    return (
      <Card className="bg-[#0a111c]/80 border-emerald-500/20 p-6 space-y-4">
        <p className="text-emerald-400 font-medium">User created.</p>
        <p className="text-sm text-white/60">
          Share this temporary password with them — it&apos;s only shown once. They should change it after first
          login.
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white font-mono">
            {state.tempPassword}
          </code>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              navigator.clipboard.writeText(state.tempPassword!)
              setCopied(true)
            }}
          >
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
        <Link href="/admin/users" className="inline-block text-sm text-purple-400 hover:underline">
          ← Back to users
        </Link>
      </Card>
    )
  }

  return (
    <Card className="bg-[#0a111c]/80 border-white/[0.08] p-6">
      <form action={formAction} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Full name *" error={state.fieldErrors?.name}>
          <Input name="name" placeholder="Neha Joshi" required />
        </Field>
        <Field label="Work email *" error={state.fieldErrors?.email}>
          <Input name="email" type="email" placeholder="neha@company.com" required />
        </Field>
        <Field label="Role *" error={state.fieldErrors?.role}>
          <select
            name="role"
            defaultValue="SALES_EXECUTIVE"
            className="h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </Field>
        <Field label="Designation" error={state.fieldErrors?.designation}>
          <Input name="designation" placeholder="Field Sales Executive" />
        </Field>
        <Field label="Phone" error={state.fieldErrors?.phone}>
          <Input name="phone" placeholder="+91 98765 43210" />
        </Field>
        <Field label="Department" error={state.fieldErrors?.departmentId}>
          <select
            name="departmentId"
            defaultValue=""
            className="h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
          >
            <option value="">None</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Team" error={state.fieldErrors?.teamId}>
          <select
            name="teamId"
            defaultValue=""
            className="h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
          >
            <option value="">None</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </Field>

        {state.error && (
          <div className="sm:col-span-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {state.error}
          </div>
        )}

        <div className="sm:col-span-2 flex justify-end">
          <Button type="submit" loading={pending} disabled={pending}>
            {pending ? 'Creating…' : 'Create user'}
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
