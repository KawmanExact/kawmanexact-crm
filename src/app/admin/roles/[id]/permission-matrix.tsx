'use client'

import { useState, useTransition } from 'react'
import { Check } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { toggleRolePermissionAction } from '../actions'

interface PermissionRow {
  id: string
  name: string
  description: string | null
  category: string
}

export function PermissionMatrix({
  roleId,
  roleName,
  permissions,
  grantedIds,
}: {
  roleId: string
  roleName: string
  permissions: PermissionRow[]
  grantedIds: string[]
}) {
  const [granted, setGranted] = useState(new Set(grantedIds))
  const [, startTransition] = useTransition()

  const byCategory = permissions.reduce<Record<string, PermissionRow[]>>((acc, p) => {
    ;(acc[p.category] ??= []).push(p)
    return acc
  }, {})

  function toggle(permissionId: string) {
    const willGrant = !granted.has(permissionId)
    setGranted((prev) => {
      const next = new Set(prev)
      if (willGrant) next.add(permissionId)
      else next.delete(permissionId)
      return next
    })
    startTransition(async () => {
      try {
        const res = await toggleRolePermissionAction(roleId, permissionId, willGrant)
        if (res?.error) {
          toast.error(res.error)
          setGranted((prev) => {
            const next = new Set(prev)
            if (willGrant) next.delete(permissionId)
            else next.add(permissionId)
            return next
          })
        } else {
          toast.success(willGrant ? 'Permission granted' : 'Permission revoked')
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to update permission')
        setGranted((prev) => {
          const next = new Set(prev)
          if (willGrant) next.delete(permissionId)
          else next.add(permissionId)
          return next
        })
      }
    })
  }

  return (
    <div className="space-y-6">
      {roleName === 'SUPER_ADMIN' && (
        <p className="text-xs text-amber-400/80 bg-amber-500/5 border border-amber-500/15 rounded-lg px-3 py-2">
          Careful — this role can manage every other role&apos;s permissions too. Removing key permissions here
          could lock admins out of parts of the app.
        </p>
      )}
      {Object.entries(byCategory).map(([category, perms]) => (
        <div key={category} className="rounded-xl border border-white/[0.08] overflow-hidden">
          <div className="bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-white">{category}</div>
          <div className="divide-y divide-white/[0.06]">
            {perms.map((p) => {
              const isGranted = granted.has(p.id)
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggle(p.id)}
                  className="w-full flex items-center justify-between gap-4 px-4 py-2.5 text-left hover:bg-white/[0.02] transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-white/80">{p.name}</p>
                    {p.description && <p className="text-xs text-white/35">{p.description}</p>}
                  </div>
                  <span
                    className={cn(
                      'h-5 w-5 shrink-0 rounded-md border flex items-center justify-center transition-colors',
                      isGranted
                        ? 'bg-purple-500 border-purple-500'
                        : 'bg-white/[0.04] border-white/15'
                    )}
                  >
                    {isGranted && <Check className="h-3.5 w-3.5 text-white" />}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
