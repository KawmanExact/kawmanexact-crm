'use client'

import { useEffect, useState, useTransition } from 'react'
import { X, Loader2, Shield } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { listFolderAccessAction, grantFolderAccessAction, revokeFolderAccessAction } from '@/app/files/actions'
import type { UserOption } from '@/services/user.service'
import type { FolderAccessGrant } from '@/services/file.service'

export function FolderAccessDialog({
  folderId,
  folderName,
  users,
  onClose,
}: {
  folderId: string
  folderName: string
  users: UserOption[]
  onClose: () => void
}) {
  const [grants, setGrants] = useState<FolderAccessGrant[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    listFolderAccessAction(folderId)
      .then(setGrants)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load access list'))
  }, [folderId])

  function handleGrant(formData: FormData) {
    setError(null)
    const userId = String(formData.get('userId') || '')
    const level = String(formData.get('level') || 'VIEWER') as 'VIEWER' | 'EDITOR' | 'MANAGER'
    if (!userId) return
    startTransition(async () => {
      const result = await grantFolderAccessAction(folderId, userId, level)
      if (result.error) setError(result.error)
      else setGrants(await listFolderAccessAction(folderId))
    })
  }

  function handleRevoke(grantId: string) {
    startTransition(async () => {
      await revokeFolderAccessAction(grantId)
      setGrants(await listFolderAccessAction(folderId))
    })
  }

  const grantedIds = new Set((grants ?? []).map((g) => g.userId))
  const availableUsers = users.filter((u) => !grantedIds.has(u.id))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-xl border border-white/10 bg-[#0a111c] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-white font-semibold flex items-center gap-2">
            <Shield className="h-4 w-4 text-purple-400" />
            Manage access
          </h3>
          <button onClick={onClose} className="text-white/40 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-xs text-white/40 mb-4">{folderName}</p>

        {grants === null ? (
          <p className="text-sm text-white/40 py-4 text-center">Loading…</p>
        ) : (
          <>
            {grants.length === 0 ? (
              <p className="text-xs text-white/40 mb-4">
                Private — only you and Admins can see this folder. Add someone below to grant access.
              </p>
            ) : (
              <ul className="space-y-2 mb-4">
                {grants.map((g) => (
                  <li key={g.id} className="flex items-center justify-between text-sm">
                    <span className="text-white/80">{g.userName}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-white/40">{g.level}</span>
                      <button
                        onClick={() => handleRevoke(g.id)}
                        disabled={pending}
                        className="text-white/30 hover:text-red-400 transition-colors"
                        title="Revoke access"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {availableUsers.length > 0 && (
              <form action={handleGrant} className="flex items-center gap-2 pt-3 border-t border-white/[0.06]">
                <select
                  name="userId"
                  defaultValue=""
                  required
                  className="h-9 flex-1 min-w-0 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                >
                  <option value="" disabled>
                    Add person
                  </option>
                  {availableUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
                <select
                  name="level"
                  defaultValue="VIEWER"
                  className="h-9 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                >
                  <option value="VIEWER">Viewer</option>
                  <option value="EDITOR">Editor</option>
                  <option value="MANAGER">Manager</option>
                </select>
                <Button type="submit" size="sm" disabled={pending} className="shrink-0">
                  {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Add'}
                </Button>
              </form>
            )}
          </>
        )}

        {error && <p className="text-xs text-red-400 mt-3">{error}</p>}
      </div>
    </div>
  )
}
