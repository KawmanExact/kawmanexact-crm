'use client'

import { useMemo, useState, useTransition, useCallback, useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Building2, Calendar, Search, AlertCircle } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import type { Deal, DealStage, DealPriority } from '@/types/crm'
import { updateDealStageAction, deleteDealAction } from '@/app/deals/actions'
import { DeleteRowButton } from '@/components/crm/delete-row-button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { DEAL_PIPELINE_STAGES, LOST_REASONS } from '@/lib/deal-pipeline'

const PRIORITY_COLOR: Record<DealPriority, string> = {
  LOW: 'text-white/40 border-white/15',
  MEDIUM: 'text-orange-300 border-orange-500/30',
  HIGH: 'text-red-300 border-red-500/30',
}

const FUNNEL_STAGES = DEAL_PIPELINE_STAGES.filter((s) => s.isFunnel)

export function DealsKanban({ deals: initialDeals }: { deals: Deal[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [deals, setDeals] = useState(initialDeals)
  const [prevInitialDeals, setPrevInitialDeals] = useState(initialDeals)
  if (prevInitialDeals !== initialDeals) {
    setPrevInitialDeals(initialDeals)
    setDeals(initialDeals)
  }

  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dragOverStage, setDragOverStage] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const [lostReasonOpen, setLostReasonOpen] = useState(false)
  const [pendingDropStage, setPendingDropStage] = useState<{ dealId: string; stage: string } | null>(null)
  const [lostReason, setLostReason] = useState('')

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
    const map = new Map<string, Deal[]>()
    for (const stage of DEAL_PIPELINE_STAGES) map.set(stage.id, [])
    for (const deal of deals) {
      const stageKey = deal.stage as string
      const arr = map.get(stageKey)
      if (arr) arr.push(deal)
    }
    return map
  }, [deals])

  function handleDrop(stage: string) {
    if (!draggedId) return

    if (stage === 'LOST') {
      setPendingDropStage({ dealId: draggedId, stage })
      setLostReasonOpen(true)
      setDraggedId(null)
      setDragOverStage(null)
      return
    }

    const dealId = draggedId
    const previousStage = deals.find((d) => d.id === dealId)?.stage as string
    setDeals((prev) => prev.map((deal) => (deal.id === dealId ? { ...deal, stage: stage as DealStage } : deal)))
    setDraggedId(null)
    setDragOverStage(null)

    if (previousStage && previousStage !== stage) {
      startTransition(async () => {
        try {
          await updateDealStageAction(dealId, stage as DealStage)
        } catch {
          setDeals((prev) =>
            prev.map((deal) => (deal.id === dealId ? { ...deal, stage: previousStage as DealStage } : deal))
          )
        }
      })
    }
  }

  function handleLostConfirm() {
    if (!pendingDropStage) return
    const { dealId, stage } = pendingDropStage
    const previousStage = deals.find((d) => d.id === dealId)?.stage as string
    setDeals((prev) =>
      prev.map((deal) =>
        deal.id === dealId ? { ...deal, stage: stage as DealStage }
        : deal
      )
    )
    setLostReasonOpen(false)
    setPendingDropStage(null)

    startTransition(async () => {
      try {
        await updateDealStageAction(dealId, stage as DealStage, lostReason)
      } catch {
        setDeals((prev) =>
          prev.map((deal) => (deal.id === dealId ? { ...deal, stage: previousStage as DealStage } : deal))
        )
      }
    })
  }

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/35" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search deals by name, company, contact..."
          className="h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] pl-9 pr-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
        />
      </div>

      <div className="space-y-3">
        {/* <div className="space-y-2">
          <h3 className="text-sm font-medium text-white/60">Sales Pipeline</h3>
          <div className="relative flex items-center justify-between mb-4">
            {FUNNEL_STAGES.map((stage, idx) => (
              <div key={stage.id} className="flex-1 text-center">
                <div
                  className="mx-auto mb-1 rounded-full"
                  style={{
                    width: 14 + (idx * 2),
                    height: 14 + (idx * 2),
                    backgroundColor: stage.color,
                  }}
                />
                <span className="text-xs font-medium text-white">{stage.label}</span>
                <p className="text-[10px] text-white/40 mt-0.5">{stage.description.substring(0, 40)}...</p>
              </div>
            ))}
            {FUNNEL_STAGES.map((_, idx) => {
              if (idx === FUNNEL_STAGES.length - 1) return null
              return (
                <div
                  key={`connector-${idx}`}
                  className="absolute"
                  style={{
                    left: `calc(${(idx * 100) / FUNNEL_STAGES.length}% + ${(idx + 1) * 14 / 2}px)`,
                    right: `calc(${(idx + 2) * 100 / FUNNEL_STAGES.length}% - ${(idx + 1) * 14 / 2}px)`,
                    top: 28,
                    height: 2,
                  }}
                >
                  <div className="absolute inset-0 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full w-1/2 bg-gradient-to-r from-transparent via-purple-400/30 to-transparent" />
                  </div>
                </div>
              )
            })}
          </div>

          <div className="relative mb-4">
            <div
              className="absolute inset-0 rounded-lg pointer-events-none"
              style={{
                background: 'linear-gradient(90deg, #ef444420 0%, #f9731620 14%, #eab30820 28%, #22c55e20 42%, #3b82f620 57%, #1e40af20 71%, #8b5cf620 85%)',
              }}
            />
            <div className="relative h-2 rounded-full bg-white/[0.06] overflow-hidden">
              <div className="absolute inset-0 flex">
                {FUNNEL_STAGES.map((stage) => {
                  const pct = 100 / FUNNEL_STAGES.length
                  return (
                    <div
                      key={stage.id}
                      className="h-full border-r border-white/5"
                      style={{ width: `${pct}%` }}
                    />
                  )
                })}
              </div>
            </div>
          </div>
        </div> */}

        <div className="flex gap-3 overflow-x-auto pb-1 scroll-smooth snap-x snap-mandatory [-webkit-overflow-scrolling:touch]">
          {DEAL_PIPELINE_STAGES.map((stage) => {
            const stageDeals = byStage.get(stage.id) ?? []
            const stageTotal = stageDeals.reduce((sum, d) => sum + d.value, 0)
            const isDragOver = dragOverStage === stage.id
            const isLostStage = !stage.isFunnel

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
                  'shrink-0 w-72 rounded-xl border bg-white/[0.02] transition-all',
                  isDragOver
                    ? 'border-purple-500/50 bg-purple-500/[0.04] scale-[1.02]'
                    : isLostStage
                      ? 'border-red-500/20 bg-red-500/[0.02]'
                      : 'border-white/[0.06]',
                  isLostStage && 'border-red-500/30'
                )}
              >
                <div
                  className="px-3 py-3 border-b flex items-center justify-between"
                  style={{
                    borderColor: 'rgba(255,255,255,0.06)',
                    backgroundColor: isLostStage ? 'rgba(239,68,68,0.1)' : 'rgba(0,0,0,0)',
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: stage.color }}
                    />
                    <span className="text-sm font-semibold text-white">{stage.label}</span>
                    <span className="text-xs text-white/40">({stageDeals.length})</span>
                  </div>
                  {stageTotal > 0 && (
                    <span className="text-xs font-medium text-white/60">{formatCurrency(stageTotal)}</span>
                  )}
                </div>

                <div className="px-3 pt-2 pb-1">
                  <p className="text-[10px] text-white/35 leading-tight">{stage.description}</p>
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
                        'rounded-lg border border-white/[0.07] bg-[#0a111c] p-3 cursor-grab active:cursor-grabbing transition-opacity group relative',
                        draggedId === deal.id && 'opacity-40'
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <Link
                          href={`/deals/${deal.id}`}
                          className="text-sm font-medium text-white leading-snug hover:text-purple-300 transition-colors line-clamp-1"
                        >
                          {deal.name}
                        </Link>
                        <DeleteRowButton
                          action={async () => {
                            await deleteDealAction(deal.id)
                            setDeals((prev) => prev.filter((d) => d.id !== deal.id))
                          }}
                          confirmLabel={`Delete "${deal.name}"?`}
                          className="opacity-0 group-hover:opacity-100 transition-opacity"
                        />
                      </div>

                      <p className="text-xs text-white/45 flex items-center gap-1 mt-1.5">
                        <Building2 className="h-3 w-3" />
                        <span className="truncate">{deal.company}</span>
                      </p>

                      <div className="flex items-center justify-between mt-3">
                        <span className="text-sm font-semibold text-white">{formatCurrency(deal.value)}</span>
                        <span
                          className={cn('text-[10px] rounded-full border px-1.5 py-0.5', PRIORITY_COLOR[deal.priority])}
                        >
                          {deal.priority}
                        </span>
                      </div>

                      <div className="flex items-center justify-between mt-2.5">
                        <span className="text-xs text-white/40 flex items-center gap-1">
                          <Calendar className="h-3 w-3" /> {deal.expectedClose || 'No date'}
                        </span>
                        <div
                          className="h-5 w-5 rounded-full flex items-center justify-center text-[9px] font-medium"
                          style={{
                            backgroundColor: deal.stage === 'LOST' ? 'rgba(107,114,128,0.3)' : `${stage.color}20`,
                            color: deal.stage === 'LOST' ? '#9ca3af' : '#a78fea',
                          }}
                          title={deal.owner}
                        >
                          {deal.ownerInitials}
                        </div>
                      </div>

                      <div className="mt-2 h-1 rounded-full bg-white/[0.06] overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${deal.probability}%`,
                            backgroundColor: stage.color,
                          }}
                        />
                      </div>

                      {deal.stage === 'PAYMENT' && deal.paymentStatus && (
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <span
                            className={cn(
                              'text-[10px] rounded-full border px-1.5 py-0.5',
                              deal.paymentStatus === 'PAID'
                                ? 'text-green-300 border-green-500/30'
                                : deal.paymentStatus === 'PARTIALLY_PAID'
                                  ? 'text-yellow-300 border-yellow-500/30'
                                  : 'text-orange-300 border-orange-500/30'
                            )}
                          >
                            {deal.paymentStatus.replace('_', ' ')}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}

                  {stageDeals.length === 0 && (
                    <div className="text-xs text-white/25 text-center py-6 border border-dashed border-white/10 rounded-lg">
                      No deals in this stage
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <Dialog open={lostReasonOpen} onOpenChange={setLostReasonOpen}>
        <DialogContent className="bg-[#0a111c] border-white/[0.08]">
          <DialogHeader>
            <DialogTitle>Mark as Lost — {pendingDropStage ? deals.find((d) => d.id === pendingDropStage.dealId)?.name : ''}</DialogTitle>
            <DialogDescription>
              Please provide a reason for losing this opportunity. This will be recorded for future reference.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="text-sm text-white/70 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-400" />
              Lost Reason
            </label>
            <select
              value={lostReason}
              onChange={(e) => setLostReason(e.target.value)}
              className="w-full h-9 rounded-lg border border-white/20 bg-white/10 px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
            >
              <option value="">Select a reason...</option>
              {LOST_REASONS.map((reason) => (
                <option key={reason} value={reason}>{reason}</option>
              ))}
              {lostReason === 'Other' && (
                <option value="Other">Other</option>
              )}
            </select>
            {lostReason === 'Other' && (
              <textarea
                placeholder="Describe the reason..."
                value={lostReason}
                onChange={(e) => setLostReason(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-purple-500/50 resize-none"
              />
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => { setLostReasonOpen(false); setPendingDropStage(null); setLostReason('') }}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleLostConfirm}
              disabled={!lostReason.trim() && lostReason !== 'Other'}
            >
              Confirm Lost
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {deals.length === 0 && (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-10 text-center">
          {hasActiveFilters ? (
            <span className="text-sm text-white/40">No deals match your search.</span>
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
  )
}
