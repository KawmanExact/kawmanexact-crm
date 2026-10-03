'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { Bookmark, Plus, X, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { listSavedViewsAction, saveViewAction, deleteSavedViewAction } from '@/app/saved-views/actions'
import type { SavedViewItem } from '@/services/saved-view.service'

/**
 * Generic saved-views control for any server-filtered list page (audit:
 * "Saved Views / Filters — No persistence of table state"). `page` is a
 * stable key ("leads") identifying which table this is for; `paramKeys`
 * lists which URL query params count as "the filter state" to save —
 * everything else (like pagination) is deliberately left out of a saved
 * view so re-applying one always starts fresh at page 1.
 */
export function SavedViewsMenu({ page, paramKeys }: { page: string; paramKeys: string[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [open, setOpen] = useState(false)
  const [views, setViews] = useState<SavedViewItem[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [newName, setNewName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if (open && views === null) {
      listSavedViewsAction(page).then(setViews)
    }
  }, [open, page, views])

  function currentFilters(): Record<string, string> {
    const filters: Record<string, string> = {}
    for (const key of paramKeys) {
      const value = searchParams.get(key)
      if (value) filters[key] = value
    }
    return filters
  }

  function applyView(view: SavedViewItem) {
    const next = new URLSearchParams()
    for (const [key, value] of Object.entries(view.filters)) next.set(key, value)
    router.push(`${pathname}?${next.toString()}`)
    setOpen(false)
  }

  function handleSave() {
    setError(null)
    const filters = currentFilters()
    if (Object.keys(filters).length === 0) {
      setError('Set at least one filter before saving a view.')
      return
    }
    startTransition(async () => {
      const result = await saveViewAction(page, newName, filters)
      if (result.error) {
        setError(result.error)
        return
      }
      setNewName('')
      setSaving(false)
      setViews(await listSavedViewsAction(page))
    })
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      await deleteSavedViewAction(id)
      setViews(await listSavedViewsAction(page))
    })
  }

  return (
    <div className="relative">
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen((v) => !v)} className="gap-1.5">
        <Bookmark className="h-3.5 w-3.5" />
        Views
        <ChevronDown className="h-3 w-3" />
      </Button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 z-20 w-64 rounded-xl border border-white/10 bg-[#0a111c] shadow-xl p-2">
            {views === null ? (
              <p className="px-2 py-3 text-xs text-white/40">Loading…</p>
            ) : views.length === 0 && !saving ? (
              <p className="px-2 py-3 text-xs text-white/40">No saved views yet.</p>
            ) : (
              <ul className="space-y-0.5 mb-1">
                {views.map((v) => (
                  <li key={v.id} className="flex items-center gap-1 group">
                    <button
                      onClick={() => applyView(v)}
                      className="flex-1 text-left px-2 py-1.5 rounded-lg text-sm text-white/80 hover:bg-white/[0.06] transition-colors truncate"
                    >
                      {v.name}
                    </button>
                    <button
                      onClick={() => handleDelete(v.id)}
                      disabled={pending}
                      className="h-6 w-6 shrink-0 rounded-md flex items-center justify-center text-white/0 group-hover:text-white/30 hover:!text-red-400 transition-colors"
                      title="Delete view"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="border-t border-white/[0.06] pt-2">
              {saving ? (
                <div className="space-y-2 px-1">
                  <input
                    autoFocus
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                    placeholder="View name"
                    className="h-8 w-full rounded-lg border border-white/[0.08] bg-white/[0.05] px-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                  />
                  {error && <p className="text-xs text-red-400">{error}</p>}
                  <div className="flex gap-1.5">
                    <Button size="sm" className="flex-1" disabled={pending} onClick={handleSave}>
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setSaving(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setError(null)
                    setSaving(true)
                  }}
                  className="flex w-full items-center gap-1.5 px-2 py-1.5 rounded-lg text-sm text-purple-400 hover:bg-white/[0.06] transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Save current filters
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
