'use client'

import { useActionState, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { updateOrganizationAction, type OrgFormState } from './actions'
import type { Organization } from '@/generated/prisma'

const initialState: OrgFormState = {}

export function OrgForm({ organization }: { organization: Organization }) {
  const [state, formAction, pending] = useActionState(updateOrganizationAction, initialState)
  const [logoPreview, setLogoPreview] = useState(organization.logo ?? '')

  return (
    <Card className="bg-[#0a111c]/80 border-white/[0.08] p-6">
      <form action={formAction} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2 flex items-center gap-4">
          <div className="h-16 w-16 shrink-0 rounded-xl border border-white/[0.08] bg-white/[0.04] flex items-center justify-center overflow-hidden">
            {logoPreview ? (
              // eslint-disable-next-line @next/next/no-img-element -- external, org-provided URL; not a local/optimized asset
              <img src={logoPreview} alt="Organization logo" className="h-full w-full object-cover" onError={() => setLogoPreview('')} />
            ) : (
              <span className="text-xs text-white/30">No logo</span>
            )}
          </div>
          <div className="flex-1 space-y-1.5">
            <label className="text-sm text-white/70">Logo URL</label>
            <Input
              name="logo"
              defaultValue={organization.logo ?? ''}
              placeholder="https://…"
              onChange={(e) => setLogoPreview(e.target.value)}
            />
            {state.fieldErrors?.logo && <p className="text-xs text-red-400">{state.fieldErrors.logo}</p>}
          </div>
        </div>

        <Field label="Organization name *" error={state.fieldErrors?.name}>
          <Input name="name" defaultValue={organization.name} required />
        </Field>
        <Field label="Industry" error={state.fieldErrors?.industry}>
          <Input name="industry" defaultValue={organization.industry ?? ''} />
        </Field>
        <Field label="Website" error={state.fieldErrors?.website}>
          <Input name="website" defaultValue={organization.website ?? ''} />
        </Field>
        <Field label="Phone" error={state.fieldErrors?.phone}>
          <Input name="phone" defaultValue={organization.phone ?? ''} />
        </Field>
        <Field label="Email" error={state.fieldErrors?.email}>
          <Input name="email" type="email" defaultValue={organization.email ?? ''} />
        </Field>
        <Field label="Timezone" error={state.fieldErrors?.timezone}>
          <Input name="timezone" defaultValue={organization.timezone} />
        </Field>
        <Field label="Currency" error={state.fieldErrors?.currency}>
          <Input name="currency" defaultValue={organization.currency} />
        </Field>
        <Field label="Date format" error={state.fieldErrors?.dateFormat}>
          <select
            name="dateFormat"
            defaultValue={organization.dateFormat}
            className="h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
          >
            <option value="DD/MM/YYYY">DD/MM/YYYY</option>
            <option value="MM/DD/YYYY">MM/DD/YYYY</option>
            <option value="YYYY-MM-DD">YYYY-MM-DD</option>
          </select>
        </Field>
        <div className="sm:col-span-2 space-y-1.5">
          <label className="text-sm text-white/70">Address</label>
          <textarea
            name="address"
            defaultValue={organization.address ?? ''}
            rows={2}
            className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
          />
        </div>

        {state.error && (
          <div className="sm:col-span-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {state.error}
          </div>
        )}
        {state.success && (
          <div className="sm:col-span-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">
            Saved.
          </div>
        )}

        <div className="sm:col-span-2 flex justify-end">
          <Button type="submit" loading={pending} disabled={pending}>
            {pending ? 'Saving…' : 'Save changes'}
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
