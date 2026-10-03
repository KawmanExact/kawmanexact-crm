'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Search, ArrowUpDown, ChevronLeft, ChevronRight, Trash2, X } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge, type BadgeVariant } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/utils'
import type { Lead, LeadStatus } from '@/types/crm'
import type { LeadPage, LeadSortKey } from '@/services/lead.service'
import type { UserOption } from '@/services/user.service'
import { bulkDeleteLeadsAction, bulkUpdateLeadStatusAction, bulkReassignLeadsAction } from '@/app/leads/actions'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { SavedViewsMenu } from '@/components/crm/saved-views-menu'

const STATUS_VARIANT: Record<LeadStatus, BadgeVariant> = {
  NEW: 'info',
  CONTACTED: 'neutral',
  QUALIFIED: 'default',
  PROPOSAL: 'warning',
  NEGOTIATION: 'warning',
  WON: 'success',
  LOST: 'danger',
}

const STATUS_LABEL: Record<LeadStatus, string> = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  QUALIFIED: 'Qualified',
  PROPOSAL: 'Proposal',
  NEGOTIATION: 'Negotiation',
  WON: 'Won',
  LOST: 'Lost',
}

/**
 * Server-side paginated / searched / sorted leads table. All filtering
 * happens in the DB query (see services/lead.service.ts#getLeadsPage) —
 * this component's only job is to read/write the URL's query string and
 * render whatever page of results the server sent down. Replaces the old
 * fetch-everything-then-filter-in-the-browser pattern, which doesn't
 * scale past a few hundred rows.
 *
 * Also owns row selection + the bulk-action bar (audit: "Bulk Actions —
 * No bulk delete/update on any table").
 */
export function LeadsTable({ result, owners, canAssign }: { result: LeadPage; owners: UserOption[]; canAssign: boolean }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  const [query, setQuery] = useState(searchParams.get('q') ?? '')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  // A new page of results (new filters, new page number) invalidates any
  // selection made against the previous set of rows. This is React's
  // documented "adjusting state during render" pattern for resetting
  // state when a prop changes, without an extra effect-triggered render.
  const [prevResult, setPrevResult] = useState(result)
  if (prevResult !== result) {
    setPrevResult(result)
    if (selected.size > 0) setSelected(new Set())
  }

  const statusFilter = (searchParams.get('status') as LeadStatus | null) ?? 'ALL'
  const sortKey = (searchParams.get('sort') as LeadSortKey | null) ?? 'lastActivityAt'
  const sortDir = (searchParams.get('dir') as 'asc' | 'desc' | null) ?? 'desc'

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === '') next.delete(key)
        else next.set(key, value)
      }
      // Any filter/sort/search change resets pagination back to page 1.
      if (!('page' in updates)) next.delete('page')
      startTransition(() => {
        router.push(`${pathname}?${next.toString()}`)
      })
    },
    [pathname, router, searchParams]
  )

  // Debounce free-text search so we're not round-tripping on every keystroke.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      if (query !== (searchParams.get('q') ?? '')) {
        updateParams({ q: query || null })
      }
    }, 350)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  function toggleSort(key: LeadSortKey) {
    if (sortKey === key) {
      updateParams({ sort: key, dir: sortDir === 'asc' ? 'desc' : 'asc' })
    } else {
      updateParams({ sort: key, dir: 'desc' })
    }
  }

  function goToPage(page: number) {
    updateParams({ page: String(page) })
  }

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === leads.length ? new Set() : new Set(leads.map((l) => l.id))))
  }

  const { leads, total, page, pageCount } = result
  const rangeStart = total === 0 ? 0 : (page - 1) * result.pageSize + 1
  const rangeEnd = Math.min(page * result.pageSize, total)
  const allSelected = leads.length > 0 && selected.size === leads.length
  const hasActiveFilters = Boolean(searchParams.get('q')?.trim() || (searchParams.get('status') && searchParams.get('status') !== 'ALL'))

  return (
    <Card className="bg-[#0a111c]/80 border-white/[0.08]">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 border-b border-white/[0.06]">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/35" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search leads by name, company, email..."
            className="pl-9"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(event) => updateParams({ status: event.target.value === 'ALL' ? null : event.target.value })}
          className="h-9 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
        >
          <option value="ALL">All statuses</option>
          {Object.entries(STATUS_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <span className="text-xs text-white/35 sm:ml-auto">
          {total === 0 ? '0 leads' : `${rangeStart}–${rangeEnd} of ${total} leads`}
        </span>
        <SavedViewsMenu page="leads" paramKeys={['q', 'status', 'sort', 'dir']} />
      </div>

      {selected.size > 0 && (
        <BulkActionBar
          selectedIds={Array.from(selected)}
          owners={owners}
          canAssign={canAssign}
          onClear={() => setSelected(new Set())}
          onDone={() => {
            setSelected(new Set())
            router.refresh()
          }}
        />
      )}

      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-white/40 text-xs uppercase tracking-wide border-b border-white/[0.06]">
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="h-4 w-4 rounded border-white/20 bg-white/[0.04] accent-purple-600"
                  aria-label="Select all leads on this page"
                />
              </th>
              <SortableHeader label="Lead" sortKey="name" activeKey={sortKey} dir={sortDir} onClick={toggleSort} />
              <th className="px-4 py-3 font-medium">Company</th>
              <th className="px-4 py-3 font-medium">Source</th>
              <th className="px-4 py-3 font-medium">Owner</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <SortableHeader label="Score" sortKey="score" activeKey={sortKey} dir={sortDir} onClick={toggleSort} />
              <SortableHeader label="Value" sortKey="value" activeKey={sortKey} dir={sortDir} onClick={toggleSort} />
              <SortableHeader
                label="Last Activity"
                sortKey="lastActivityAt"
                activeKey={sortKey}
                dir={sortDir}
                onClick={toggleSort}
              />
            </tr>
          </thead>
          <tbody>
            {leads.map((lead: Lead) => (
              <tr
                key={lead.id}
                className={`border-b border-white/[0.04] hover:bg-white/[0.03] transition-colors ${
                  selected.has(lead.id) ? 'bg-purple-500/[0.06]' : ''
                }`}
              >
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selected.has(lead.id)}
                    onChange={() => toggleRow(lead.id)}
                    className="h-4 w-4 rounded border-white/20 bg-white/[0.04] accent-purple-600"
                    aria-label={`Select ${lead.name}`}
                  />
                </td>
                <td className="px-4 py-3">
                  <Link href={`/leads/${lead.id}`} className="font-medium text-white hover:text-purple-300 transition-colors">
                    {lead.name}
                  </Link>
                  <p className="text-xs text-white/40">{lead.email}</p>
                </td>
                <td className="px-4 py-3 text-white/70">{lead.company}</td>
                <td className="px-4 py-3 text-white/55">{lead.source}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 rounded-full bg-purple-600/25 flex items-center justify-center text-[10px] font-medium text-purple-300">
                      {lead.ownerInitials}
                    </div>
                    <span className="text-white/70">{lead.owner}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <Badge variant={STATUS_VARIANT[lead.status]}>{STATUS_LABEL[lead.status]}</Badge>
                </td>
                <td className="px-4 py-3 text-white/70">{lead.score}</td>
                <td className="px-4 py-3 text-white font-medium">{formatCurrency(lead.value)}</td>
                <td className="px-4 py-3 text-white/45">{lead.lastActivityAt}</td>
              </tr>
            ))}
            {leads.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center">
                  {hasActiveFilters ? (
                    <span className="text-white/40">No leads match your filters.</span>
                  ) : (
                    <span className="flex flex-col items-center gap-3">
                      <span className="text-white/40">No leads yet.</span>
                      <Link
                        href="/leads/new"
                        className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-500 transition-colors"
                      >
                        Create your first lead
                      </Link>
                    </span>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile card view */}
      <div className="md:hidden divide-y divide-white/[0.04]">
        {leads.map((lead: Lead) => (
          <div key={lead.id} className="p-4 space-y-2.5">
            <div className="flex items-start justify-between gap-2">
              <Link href={`/leads/${lead.id}`} className="text-sm font-medium text-white hover:text-purple-300 truncate">
                {lead.name}
              </Link>
              <Badge variant={STATUS_VARIANT[lead.status]}>{STATUS_LABEL[lead.status]}</Badge>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
              <span className="text-white/35">Company</span><span className="text-white/70 truncate text-right">{lead.company || '—'}</span>
              <span className="text-white/35">Owner</span><span className="text-white/70 truncate text-right">{lead.owner}</span>
              <span className="text-white/35">Source</span><span className="text-white/55 text-right">{lead.source}</span>
              <span className="text-white/35">Score</span><span className="text-white/70 text-right">{lead.score}</span>
              <span className="text-white/35">Value</span><span className="text-white font-medium text-right">{formatCurrency(lead.value)}</span>
              <span className="text-white/35">Last activity</span><span className="text-white/45 text-right">{lead.lastActivityAt}</span>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                checked={selected.has(lead.id)}
                onChange={() => toggleRow(lead.id)}
                className="h-4 w-4 rounded border-white/20 bg-white/[0.04] accent-purple-600"
                aria-label={`Select ${lead.name}`}
              />
              <span className="text-xs text-white/30">Select</span>
              <span className="text-xs text-white/40 truncate ml-auto">{lead.email}</span>
            </div>
          </div>
        ))}
        {leads.length === 0 && (
          <div className="px-4 py-10 text-center">
            {hasActiveFilters ? (
              <span className="text-sm text-white/40">No leads match your filters.</span>
            ) : (
              <span className="flex flex-col items-center gap-3">
                <span className="text-sm text-white/40">No leads yet.</span>
                <Link
                  href="/leads/new"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-500 transition-colors"
                >
                  Create your first lead
                </Link>
              </span>
            )}
          </div>
        )}
      </div>

      {pageCount > 1 && (
        <div className="flex items-center justify-between gap-3 p-4 border-t border-white/[0.06]">
          <span className="text-xs text-white/40">
            Page {page} of {pageCount}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => goToPage(page - 1)}
              disabled={page <= 1}
              className="flex items-center gap-1 h-8 px-2.5 rounded-lg border border-white/[0.08] text-xs text-white/70 hover:bg-white/[0.05] disabled:opacity-30 disabled:pointer-events-none transition-colors"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Prev
            </button>
            <button
              onClick={() => goToPage(page + 1)}
              disabled={page >= pageCount}
              className="flex items-center gap-1 h-8 px-2.5 rounded-lg border border-white/[0.08] text-xs text-white/70 hover:bg-white/[0.05] disabled:opacity-30 disabled:pointer-events-none transition-colors"
            >
              Next <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </Card>
  )
}

function BulkActionBar({
  selectedIds,
  owners,
  canAssign,
  onClear,
  onDone,
}: {
  selectedIds: string[]
  owners: UserOption[]
  canAssign: boolean
  onClear: () => void
  onDone: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  function run(action: () => Promise<{ error?: string; updated?: number }>) {
    setError(null)
    startTransition(async () => {
      const result = await action()
      if (result.error) setError(result.error)
      else onDone()
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3 bg-purple-500/[0.08] border-b border-purple-500/20">
      <span className="text-sm text-white/80 font-medium">{selectedIds.length} selected</span>

      <select
        defaultValue=""
        disabled={pending}
        onChange={(e) => {
          if (!e.target.value) return
          run(() => bulkUpdateLeadStatusAction(selectedIds, e.target.value))
          e.target.value = ''
        }}
        className="h-8 rounded-lg border border-white/[0.08] bg-white/[0.06] px-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
      >
        <option value="" disabled>
          Change status…
        </option>
        {Object.entries(STATUS_LABEL).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>

      {canAssign && (
        <select
          defaultValue=""
          disabled={pending}
          onChange={(e) => {
            if (!e.target.value) return
            run(() => bulkReassignLeadsAction(selectedIds, e.target.value))
            e.target.value = ''
          }}
          className="h-8 rounded-lg border border-white/[0.08] bg-white/[0.06] px-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
        >
          <option value="" disabled>
            Reassign to…
          </option>
          {owners.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      )}

      <Button
        type="button"
        variant="destructive"
        size="sm"
        disabled={pending}
        className="gap-1.5"
        onClick={() => setConfirmOpen(true)}
      >
        <Trash2 className="h-3.5 w-3.5" />
        Delete
      </Button>

      {error && <span className="text-xs text-red-400">{error}</span>}

      <button
        type="button"
        onClick={onClear}
        disabled={pending}
        className="ml-auto flex items-center gap-1 text-xs text-white/40 hover:text-white transition-colors"
      >
        <X className="h-3.5 w-3.5" /> Clear
      </button>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Delete ${selectedIds.length} lead(s)?`}
        description="This cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        loading={pending}
        onConfirm={() => run(() => bulkDeleteLeadsAction(selectedIds))}
      />
    </div>
  )
}

function SortableHeader({
  label,
  sortKey,
  activeKey,
  dir,
  onClick,
}: {
  label: string
  sortKey: LeadSortKey
  activeKey: LeadSortKey
  dir: 'asc' | 'desc'
  onClick: (key: LeadSortKey) => void
}) {
  const isActive = sortKey === activeKey
  return (
    <th className="px-4 py-3 font-medium">
      <button onClick={() => onClick(sortKey)} className="flex items-center gap-1 hover:text-white transition-colors">
        {label}
        <ArrowUpDown className={`h-3 w-3 ${isActive ? 'text-purple-400' : 'text-white/25'}`} />
        {isActive && <span className="sr-only">{dir === 'asc' ? 'ascending' : 'descending'}</span>}
      </button>
    </th>
  )
}
