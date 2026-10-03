'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { shareFileAction } from '@/app/files/actions'
import type { UserOption } from '@/services/user.service'

export function ShareDialog({ fileId, users, onClose }: { fileId: string; users: UserOption[]; onClose: () => void }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const result = await shareFileAction(fileId, formData)
      if (result.error) setError(result.error)
      else {
        router.refresh()
        onClose()
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-xl border border-white/10 bg-[#0a111c] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-semibold">Share file</h3>
          <button onClick={onClose} className="text-white/40 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form action={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm text-white/70">Share with</label>
            <select
              name="sharedWithId"
              defaultValue=""
              required
              className="h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
            >
              <option value="" disabled>
                Choose a person
              </option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm text-white/70">Permission</label>
            <select
              name="level"
              defaultValue="VIEWER"
              className="h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
            >
              <option value="VIEWER">Viewer</option>
              <option value="EDITOR">Editor</option>
              <option value="MANAGER">Manager</option>
            </select>
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={pending} className="gap-1.5">
              {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Share
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
