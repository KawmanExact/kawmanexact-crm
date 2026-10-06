'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Search, ArrowUpDown, ChevronLeft, ChevronRight, Trash2, X } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge, type BadgeVariant } from '@/components/ui/badge'
import type { Deal, DealStage } from '@/types/crm'
import type { DealPage, DealSortKey } from '@/services/deal.service'
import type { UserOption } from '@/services/user.service'
import { bulkDeleteDealsAction, bulkUpdateDealStageAction, bulkReassignDealsAction } from '@/app/deals/actions'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { SavedViewsMenu } from '@/components/crm/saved-views-menu'
import { DEAL_PIPELINE_STAGES, getStageLabel } from '@/lib/deal-pipeline'

const STAGE_VARIANT: Record<DealStage, BadgeVariant> = {
  SUSPECT: 'info',
  PROSPECT: 'neutral',
  APPROACH_ANALYSE: 'warning',
  NEGOTIATE: 'warning',
  CLOSE: 'success',
  ORDER: 'default',
  PAYMENT: 'success',
  LOST: 'danger',
}

/**
 * Table view of the same deals the kanban shows. All filtering happens in the
 * DB query (see services/deal.service.ts#getDealsPage) — this component only
 * reads/writes the URL's query string and renders the page it is sent, plus
 * row selection and the bulk-action bar.
 */
export function DealsTable({
  result,
  owners,
  canAssign,
}: {
  result: DealPage
  owners: UserOption[]
  canAssign: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  const [query, setQuery] = useState(searchParams.get('q') ?? '')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  // A new page of results (new filters, new page number) invalidates any
  // selection made against the previous set of rows.
  const [prevResult, setPrevResult] = useState(result)
  if (prevResult !== result) {
    setPrevResult(result)
    if (selected.size > 0) setSelected(new Set())
  }

  const stageFilter = searchParams.get('stage') ?? 'ALL'
  const sortKey = (searchParams.get('sort') as DealSortKey | null) ?? 'lastActivityAt'
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

  function toggleSort(key: DealSortKey) {
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
    setSelected((prev) => (prev.size === deals.length ? new Set() : new Set(deals.map((d) => d.id))))
  }

  const { deals, total, page, pageCount } = result
  const rangeStart = total === 0 ? 0 : (page - 1) * result.pageSize + 1
  const rangeEnd = Math.min(page * result.pageSize, total)
  const allSelected = deals.length > 0 && selected.size === deals.length
  const hasActiveFilters = Boolean(searchParams.get('q')?.trim() || (searchParams.get('stage') && searchParams.get('stage') !== 'ALL'))

  return (
    <Card className="bg-[#0a111c]/80 border-white/[0.08]">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 border-b border-white/[0.06]">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-2 h-4 w-4 text-white/35" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search deals by name, company, contact..."
            className="pl-9"
          />
        </div>
        <select
          value={stageFilter}
          onChange={(event) => updateParams({ stage: event.target.value === 'ALL' ? null : event.target.value })}
          className="h-9 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
        >
          <option value="ALL">All stages</option>
          {DEAL_PIPELINE_STAGES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <span className="text-xs text-white/35 sm:ml-auto">
          {total === 0 ? '0 deals' : `${rangeStart}–${rangeEnd} of ${total} deals`}
        </span>
        {/* `view` is part of the filter state: this table lives at
            /deals?view=list, so re-applying a view has to keep the tab. */}
        <SavedViewsMenu page="deals" paramKeys={['view', 'q', 'stage', 'sort', 'dir']} />
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
                  aria-label="Select all deals on this page"
                />
              </th>
              <SortableHeader label="Deal" sortKey="name" activeKey={sortKey} dir={sortDir} onClick={toggleSort} />
              <th className="px-4 py-3 font-medium">Contact</th>
              <th className="px-4 py-3 font-medium">Company</th>
              <th className="px-4 py-3 font-medium">City / Country / Pin</th>
              <th className="px-4 py-3 font-medium">Products</th>
              <th className="px-4 py-3 font-medium">Purpose of Visit</th>
              <th className="px-4 py-3 font-medium">Meeting At</th>
              <th className="px-4 py-3 font-medium">Meeting Mode</th>
              <th className="px-4 py-3 font-medium">Key Discussion</th>
              <th className="px-4 py-3 font-medium">Customer Requirement</th>
              <th className="px-4 py-3 font-medium">Grade</th>
              <th className="px-4 py-3 font-medium">Application</th>
              <th className="px-4 py-3 font-medium">CDA</th>
              <th className="px-4 py-3 font-medium">Sampling</th>
              <th className="px-4 py-3 font-medium">R&D Feedback</th>
              <th className="px-4 py-3 font-medium">LOA Status</th>
              <th className="px-4 py-3 font-medium">Remark</th>
              <th className="px-4 py-3 font-medium">Next follow-up</th>
              <th className="px-4 py-3 font-medium">Source</th>
              <th className="px-4 py-3 font-medium">Owner</th>
              <SortableHeader label="Stage" sortKey="value" activeKey={sortKey} dir={sortDir} onClick={toggleSort} />
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
            {deals.map((deal: Deal) => (
              <tr
                key={deal.id}
                className={`border-b border-white/[0.04] hover:bg-white/[0.03] transition-colors ${
                  selected.has(deal.id) ? 'bg-purple-500/[0.06]' : ''
                }`}
              >
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selected.has(deal.id)}
                    onChange={() => toggleRow(deal.id)}
                    className="h-4 w-4 rounded border-white/20 bg-white/[0.04] accent-purple-600"
                    aria-label={`Select ${deal.name}`}
                  />
                </td>
                <td className="px-4 py-3">
                  <Link href={`/deals/${deal.id}`} className="font-medium text-white hover:text-purple-300 transition-colors">
                    {deal.name}
                  </Link>
                  <p className="text-xs text-white/40">{deal.email}</p>
                </td>
                <td className="px-4 py-3 text-white/70 truncate max-w-[12rem]">{deal.contactPerson ?? '—'}</td>
                <td className="px-4 py-3 text-white/55 truncate max-w-[14rem]">{deal.company === '—' ? '—' : deal.company}</td>
                <td className="px-4 py-3 text-white/55 truncate max-w-[14rem]]">
                  {deal.city ? [deal.city, deal.country, deal.pinCode].filter(Boolean).join(', ') : '—'}
                </td>
                <td className="px-4 py-3 text-white/55 truncate max-w-[14rem]">
                  {deal.productsDiscussed?.slice(0, 2).join(', ') || '—'}
                  {deal.customProductNames && deal.customProductNames.length > 0 && (
                    <span className="ml-1 text-amber-300"> ({deal.customProductNames.slice(0, 2).join(', ')})</span>
                  )}
                </td>
                <td className="px-4 py-3 text-white/55 truncate max-w-[14rem]">{deal.purposeOfVisit || '—'}</td>
                <td className="px-4 py-3 text-white/55 truncate max-w-[12rem]">{deal.meetingAt || '—'}</td>
                <td className="px-4 py-3 text-white/55 truncate max-w-[10rem]">{deal.meetingMode || '—'}</td>
                <td className="px-4 py-3 text-white/55 truncate max-w-[14rem]">{deal.keyDiscussion || '—'}</td>
                <td className="px-4 py-3 text-white/55 truncate max-w-[14rem]">{deal.requirement || '—'}</td>
                <td className="px-4 py-3 text-white/55 truncate max-w-[10rem]">{deal.grade || '—'}</td>
                <td className="px-4 py-3 text-white/55 truncate max-w-[14rem]">{deal.application === 'Other' ? `Other: ${deal.applicationOther}` : (deal.application || '—')}</td>
                <td className="px-4 py-3 text-white/55">{deal.cdaStatus ?? '—'}</td>
                <td className="px-4 py-3 text-white/55">{deal.samplingStatus ?? '—'}</td>
                <td className="px-4 py-3 text-white/55">{deal.rdFeedback ?? '—'}</td>
                <td className="px-4 py-3 text-white/55">{deal.loaStatus ?? '—'}</td>
                <td className="px-4 py-3 text-white/55 truncate max-w-[14rem]">{deal.remark ?? '—'}</td>
                <td className="px-4 py-3 text-white/45">{deal.nextFollowUp || '—'}</td>
                <td className="px-4 py-3 text-white/55">{deal.source}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 rounded-full bg-purple-600/25 flex items-center justify-center text-[10px] font-medium text-purple-300">
                      {deal.ownerInitials}
                    </div>
                    <span className="text-white/70">{deal.owner}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <Badge variant={STAGE_VARIANT[deal.stage]}>{getStageLabel(deal.stage)}</Badge>
                </td>
                <td className="px-4 py-3 text-white/45">{deal.lastActivityAt || '—'}</td>
              </tr>
            ))}
            {deals.length === 0 && (
              <tr>
                <td colSpan={13} className="px-4 py-10 text-center">
                  {hasActiveFilters ? (
                    <span className="text-white/40">No deals match your filters.</span>
                  ) : (
                    <span className="flex flex-col items-center gap-3">
                      <span className="text-white/40">No deals yet.</span>
                      <Link
                        href="/deals/new"
                        className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-500 transition-colors"
                      >
                        Create your first deal
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
        {deals.map((deal: Deal) => (
          <div key={deal.id} className="p-4 space-y-2.5">
            <div className="flex items-start justify-between gap-2">
              <Link href={`/deals/${deal.id}`} className="text-sm font-medium text-white hover:text-purple-300 truncate">
                {deal.name}
              </Link>
              <Badge variant={STAGE_VARIANT[deal.stage]}>{getStageLabel(deal.stage)}</Badge>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
              <span className="text-white/35">Contact</span><span className="text-white/70 truncate text-right">{deal.contactPerson || deal.company || '—'}</span>
              <span className="text-white/35">City / Country / Pin</span><span className="text-white/55 truncate text-right">
                {deal.city ? [deal.city, deal.country, deal.pinCode].filter(Boolean).join(', ') : '—'}
              </span>
              <span className="text-white/35">Products</span><span className="text-white/55 truncate text-right">
                {deal.productsDiscussed?.slice(0, 2).join(', ') || '—'}
                {deal.customProductNames && deal.customProductNames.length > 0 && (
                  <span className="ml-1 text-amber-300"> ({deal.customProductNames.slice(0, 2).join(', ')})</span>
                )}
              </span>
              <span className="text-white/35">Purpose of Visit</span><span className="text-white/55 truncate text-right">{deal.purposeOfVisit || '—'}</span>
              <span className="text-white/35">Meeting At</span><span className="text-white/55 truncate text-right">{deal.meetingAt || '—'}</span>
              <span className="text-white/35">Meeting Mode</span><span className="text-white/55 truncate text-right">{deal.meetingMode || '—'}</span>
              <span className="text-white/35">Key Discussion</span><span className="text-white/55 truncate text-right">{deal.keyDiscussion || '—'}</span>
              <span className="text-white/35">Customer Requirement</span><span className="text-white/55 truncate text-right">{deal.requirement || '—'}</span>
              <span className="text-white/35">Grade</span><span className="text-white/55 truncate text-right">{deal.grade || '—'}</span>
              <span className="text-white/35">Application</span><span className="text-white/55 truncate text-right">{deal.application === 'Other' ? `Other: ${deal.applicationOther}` : (deal.application || '—')}</span>
              <span className="text-white/35">CDA</span><span className="text-white/55 text-right">{deal.cdaStatus ?? '—'}</span>
              <span className="text-white/35">Sampling</span><span className="text-white/55 text-right">{deal.samplingStatus ?? '—'}</span>
              <span className="text-white/35">R&D Feedback</span><span className="text-white/55 text-right">{deal.rdFeedback ?? '—'}</span>
              <span className="text-white/35">LOA Status</span><span className="text-white/55 text-right">{deal.loaStatus ?? '—'}</span>
              <span className="text-white/35">Remark</span><span className="text-white/55 truncate text-right">{deal.remark ?? '—'}</span>
              <span className="text-white/35">Next follow-up</span><span className="text-white/45 text-right">{deal.nextFollowUp || '—'}</span>
              <span className="text-white/35">Source</span><span className="text-white/55 text-right">{deal.source}</span>
              <span className="text-white/35">Owner</span><span className="text-white/70 truncate text-right">{deal.owner}</span>
              <span className="text-white/35">Last activity</span><span className="text-white/45 text-right">{deal.lastActivityAt || '—'}</span>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                checked={selected.has(deal.id)}
                onChange={() => toggleRow(deal.id)}
                className="h-4 w-4 rounded border-white/20 bg-white/[0.04] accent-purple-600"
                aria-label={`Select ${deal.name}`}
              />
              <span className="text-xs text-white/30">Select</span>
              <span className="text-xs text-white/40 truncate ml-auto">{deal.email}</span>
            </div>
          </div>
        ))}
        {deals.length === 0 && (
          <div className="px-4 py-10 text-center">
            {hasActiveFilters ? (
              <span className="text-sm text-white/40">No deals match your filters.</span>
            ) : (
              <span className="flex flex-col items-center gap-3">
                <span className="text-sm text-white/40">No deals yet.</span>
                <Link
                  href="/deals/new"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-500 transition-colors"
                >
                  Create your first deal
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
          run(() => bulkUpdateDealStageAction(selectedIds, e.target.value))
          e.target.value = ''
        }}
        className="h-8 rounded-lg border border-white/[0.08] bg-white/[0.06] px-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
      >
        <option value="" disabled>
          Move to stage…
        </option>
        {DEAL_PIPELINE_STAGES.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>

      {canAssign && (
        <select
          defaultValue=""
          disabled={pending}
          onChange={(e) => {
            if (!e.target.value) return
            run(() => bulkReassignDealsAction(selectedIds, e.target.value))
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
        title={`Delete ${selectedIds.length} deal(s)?`}
        description="This cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        loading={pending}
        onConfirm={() => run(() => bulkDeleteDealsAction(selectedIds))}
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
  sortKey: DealSortKey
  activeKey: DealSortKey
  dir: 'asc' | 'desc'
  onClick: (key: DealSortKey) => void
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