'use client'

import { useActionState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { createDepartmentAction, type DeptFormState } from './actions'
import type { UserOption } from '@/services/user.service'

const initialState: DeptFormState = {}

export function DepartmentForm({ managers }: { managers: UserOption[] }) {
  const [state, formAction, pending] = useActionState(createDepartmentAction, initialState)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (state.success) {
      toast.success('Department created')
      formRef.current?.reset()
    }
    if (state.error) toast.error(state.error)
  }, [state.success, state.error])

  return (
    <form ref={formRef} action={formAction} className="flex flex-wrap items-end gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
      <div className="space-y-1.5">
        <label className="text-xs text-white/60">Department name</label>
        <Input name="name" placeholder="Marketing" className="w-48" required />
        {state.fieldErrors?.name && <p className="text-xs text-red-400">{state.fieldErrors.name}</p>}
      </div>
      <div className="space-y-1.5">
        <label className="text-xs text-white/60">Manager</label>
        <select
          name="managerId"
          defaultValue=""
          className="h-9 w-44 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
        >
          <option value="">None</option>
          {managers.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5 flex-1 min-w-[160px]">
        <label className="text-xs text-white/60">Description</label>
        <Input name="description" placeholder="Optional" />
      </div>
      <Button type="submit" loading={pending} disabled={pending}>
        {pending ? 'Adding…' : 'Add department'}
      </Button>
    </form>
  )
}
