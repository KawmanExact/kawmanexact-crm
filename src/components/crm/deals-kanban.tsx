'use client'

import { useMemo, useState, useTransition, useCallback, useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Building2, Calendar, Search } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import type { Deal, DealStage, DealPriority } from '@/types/crm'
import { updateDealStageAction, deleteDealAction } from '@/app/deals/actions'
import { DeleteRowButton } from '@/components/crm/delete-row-button'

const STAGES: { id: DealStage; label: string; accent: string }[] = [
  { id: 'NEW_LEAD', label: 'New Lead', accent: '#60a5fa' },
  { id: 'CONTACTED', label: 'Contacted', accent: '#38bdf8' },
  { id: 'QUALIFIED', label: 'Qualified', accent: '#34d399' },
  { id: 'PROPOSAL', label: 'Proposal', accent: '#fb923c' },
  { id: 'NEGOTIATION', label: 'Negotiation', accent: '#a78bfa' },
  { id: 'WON', label: 'Won', accent: '#22c55e' },
  { id: 'LOST', label: 'Lost', accent: '#ef4444' },
]

const PRIORITY_COLOR: Record<DealPriority, string> = {
  LOW: 'text-white/40 border-white/15',
  MEDIUM: 'text-orange-300 border-orange-500/30',
  HIGH: 'text-red-300 border-red-500/30',
}

export function DealsKanban({ deals: initialDeals }: { deals: Deal[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [deals, setDeals] = useState(initialDeals)
  // Re-sync local state whenever the server sends a new `deals` array —
  // e.g. after a search narrows the results. Without this, the board
  // would keep showing stale (pre-search) cards, since useState's
  // initializer only runs once on mount, not on every prop change.
  // "Adjust state during render" (React's documented pattern), same
  // approach already used in leads-table.tsx for its selection reset.
  const [prevInitialDeals, setPrevInitialDeals] = useState(initialDeals)
  if (prevInitialDeals !== initialDeals) {
    setPrevInitialDeals(initialDeals)
    setDeals(initialDeals)
  }

  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dragOverStage, setDragOverStage] = useState<DealStage | null>(null)
  const [, startTransition] = useTransition()

  // Search (audit: "Server-Side Search & Filtering — Deals where
  // appropriate"). Deliberately no page-number pagination here, unlike
  // the table-based CRM pages — the whole point of a Kanban board is
  // seeing the full pipeline grouped by stage at a glance, which paging
  // through would defeat. Search still narrows what's fetched from the
  // DB server-side (see services/deal.service.ts#getDeals), it just
  // doesn't page the result.
  const hasActiveFilters = Boolean(searchParams.get('q')?.trim())
  const [query, setQuery] = useState(searchParams.get('q') ?? '')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [, startSearchTransition] = useTransition()

  const updateSearch = useCallback(
    (value: string) => {
      const next = new URLSearchParams(searchParams.toString())
      if (value) next.set('q', value)
      else next.delete('q')
      startSearchTransition(() => {
        router.push(`${pathname}?${next.toString()}`)
      })
    },
    [pathname, router, searchParams]
  )

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      if (query !== (searchParams.get('q') ?? '')) updateSearch(query)
    }, 350)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  const byStage = useMemo(() => {
    const map = new Map<DealStage, Deal[]>()
    for (const stage of STAGES) map.set(stage.id, [])
    for (const deal of deals) map.get(deal.stage)?.push(deal)
    return map
  }, [deals])

  function handleDrop(stage: DealStage) {
    if (!draggedId) return
    const dealId = draggedId
    const previousStage = deals.find((d) => d.id === dealId)?.stage
    setDeals((prev) => prev.map((deal) => (deal.id === dealId ? { ...deal, stage } : deal)))
    setDraggedId(null)
    setDragOverStage(null)

    if (previousStage && previousStage !== stage) {
      startTransition(async () => {
        try {
          await updateDealStageAction(dealId, stage)
        } catch {
          // Roll back the optimistic move if the write failed (e.g. permission denied).
          setDeals((prev) => prev.map((deal) => (deal.id === dealId ? { ...deal, stage: previousStage } : deal)))
        }
      })
    }
  }

  return (
    <div className="space-y-3">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/35" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search deals by name, company, contact..."
          className="h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] pl-9 pr-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
        />
      </div>
      {deals.length === 0 && (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-10 text-center">
          {hasActiveFilters ? (
            <span className="text-sm text-white/40">No deals match your search.</span>
          ) : (
            <span className="flex flex-col items-center gap-3">
              <span className="text-sm text-white/40">No deals yet.</span>
              <Link href="/deals/new" className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-500 transition-colors">Create your first deal</Link>
            </span>
          )}
        </div>
      )}
      <div className="flex gap-4 overflow-x-auto pb-2 scroll-smooth snap-x snap-mandatory [-webkit-overflow-scrolling:touch]">
      {STAGES.map((stage) => {
        const stageDeals = byStage.get(stage.id) ?? []
        const stageTotal = stageDeals.reduce((sum, d) => sum + d.value, 0)
        const isDragOver = dragOverStage === stage.id

        return (
          <div
            key={stage.id}
            onDragOver={(event) => {
              event.preventDefault()
              setDragOverStage(stage.id)
            }}
            onDragLeave={() => setDragOverStage((current) => (current === stage.id ? null : current))}
            onDrop={() => handleDrop(stage.id)}
            className={cn(
              'shrink-0 w-72 rounded-xl border bg-white/[0.02] transition-colors',
              isDragOver ? 'border-purple-500/50 bg-purple-500/[0.04]' : 'border-white/[0.06]'
            )}
          >
            <div className="flex items-center justify-between px-3 py-3 border-b border-white/[0.06]">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: stage.accent }} />
                <span className="text-sm font-semibold text-white">{stage.label}</span>
                <span className="text-xs text-white/40">({stageDeals.length})</span>
              </div>
            </div>
            <div className="px-3 pt-2 pb-1">
              <span className="text-xs text-white/45">{formatCurrency(stageTotal)}</span>
            </div>

            <div className="p-2 space-y-2 min-h-[120px]">
              {stageDeals.map((deal) => (
                <div
                  key={deal.id}
                  draggable
                  onDragStart={() => setDraggedId(deal.id)}
                  onDragEnd={() => {
                    setDraggedId(null)
                    setDragOverStage(null)
                  }}
                  className={cn(
                    'rounded-lg border border-white/[0.07] bg-[#0a111c] p-3 cursor-grab active:cursor-grabbing transition-opacity',
                    draggedId === deal.id && 'opacity-40'
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      href={`/deals/${deal.id}`}
                      className="text-sm font-medium text-white leading-snug hover:text-purple-300 transition-colors"
                    >
                      {deal.name}
                    </Link>
                    <DeleteRowButton
                      action={async () => {
                        await deleteDealAction(deal.id)
                        setDeals((prev) => prev.filter((d) => d.id !== deal.id))
                      }}
                      confirmLabel={`Delete "${deal.name}"?`}
                    />
                  </div>
                  <p className="text-xs text-white/45 flex items-center gap-1 mt-1.5">
                    <Building2 className="h-3 w-3" /> {deal.company}
                  </p>
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-sm font-semibold text-white">{formatCurrency(deal.value)}</span>
                    <span className={cn('text-[10px] rounded-full border px-1.5 py-0.5', PRIORITY_COLOR[deal.priority])}>
                      {deal.priority}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-2.5">
                    <span className="text-xs text-white/40 flex items-center gap-1">
                      <Calendar className="h-3 w-3" /> {deal.expectedClose}
                    </span>
                    <div
                      className="h-5 w-5 rounded-full bg-purple-600/25 flex items-center justify-center text-[9px] font-medium text-purple-300"
                      title={deal.owner}
                    >
                      {deal.ownerInitials}
                    </div>
                  </div>
                  <div className="mt-2 h-1 rounded-full bg-white/[0.06] overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${deal.probability}%`, backgroundColor: stage.accent }}
                    />
                  </div>
                </div>
              ))}
              {stageDeals.length === 0 && (
                <div className="text-xs text-white/25 text-center py-6 border border-dashed border-white/10 rounded-lg">
                  Drop a deal here
                </div>
              )}
            </div>
          </div>
        )
      })}
      </div>
    </div>
  )
}
