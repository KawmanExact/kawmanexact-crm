'use client'
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import type { FieldVisit, VisitStatus } from '@/types/field-sales'
import type { FieldVisitPageResult } from '@/services/field-visit.service'
import { updateVisitStatusAction } from '@/app/field-sales/actions'
import { VisitRow, STATUS_LABEL } from './visit-row'

type FieldVisitsTableProps = { visits: FieldVisit[]; result?: undefined } | { result: FieldVisitPageResult; visits?: undefined }
/**
 * Two modes, sharing all row-rendering and interactive-action markup
 * (check-in button, status dropdown):
 *  - `visits` prop: original client-side-filtered behavior, kept for
 *    /field-sales/visits ("Today's Visits") — an inherently small,
 *    single-day dataset where pagination doesn't add value.
 *  - `result` prop: server-side paginated/searched/sorted data (see
 *    services/field-visit.service.ts#getFieldVisitsPage), used by the
 *    main /field-sales list page.
 */
export function FieldVisitsTable(props: FieldVisitsTableProps) {
  const isServerMode = Boolean(props.result)
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  // Client-mode state (used only when `visits` is provided).
  const [localQuery, setLocalQuery] = useState('')
  const [localStatusFilter, setLocalStatusFilter] = useState<'ALL' | VisitStatus>('ALL')

  // Server-mode state (used only when `result` is provided) — mirrors
  // leads-table.tsx's URL-driven pattern.
  const [query, setQuery] = useState(searchParams.get('q') ?? '')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const statusFilter = (searchParams.get('status') as VisitStatus | null) ?? 'ALL'

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === '') next.delete(key)
        else next.set(key, value)
      }
      if (!('page' in updates)) next.delete('page')
      startTransition(() => {
        router.push(`${pathname}?${next.toString()}`)
      })
    },
    [pathname, router, searchParams]
  )

  useEffect(() => {
    if (!isServerMode) return
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
  }, [query, isServerMode])

  const clientFiltered = useMemo(() => {
    if (isServerMode) return []
    let rows = props.visits ?? []
    if (localStatusFilter !== 'ALL') rows = rows.filter((v) => v.status === localStatusFilter)
    if (localQuery.trim()) {
      const q = localQuery.trim().toLowerCase()
      rows = rows.filter(
        (v) =>
          v.title.toLowerCase().includes(q) ||
          (v.company ?? '').toLowerCase().includes(q) ||
          v.assignee.toLowerCase().includes(q)
      )
    }
    return rows
  }, [isServerMode, props.visits, localQuery, localStatusFilter])

  const displayVisits = isServerMode ? props.result!.visits : clientFiltered
  const totalLabel = isServerMode
    ? (() => {
        const { total, page, pageSize } = props.result!
        if (total === 0) return '0 visits'
        const start = (page - 1) * pageSize + 1
        const end = Math.min(page * pageSize, total)
        return `${start}–${end} of ${total} visits`
      })()
    : `${clientFiltered.length} of ${(props.visits ?? []).length} visits`

  return (
    <Card className="bg-[#0a111c]/80 border-white/[0.08]">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 border-b border-white/[0.06]">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/35" />
          <Input
            value={isServerMode ? query : localQuery}
            onChange={(e) => (isServerMode ? setQuery(e.target.value) : setLocalQuery(e.target.value))}
            placeholder="Search visits by title, company, rep..."
            className="pl-9"
          />
        </div>
        <select
          value={isServerMode ? statusFilter : localStatusFilter}
          onChange={(e) =>
            isServerMode
              ? updateParams({ status: e.target.value === 'ALL' ? null : e.target.value })
              : setLocalStatusFilter(e.target.value as 'ALL' | VisitStatus)
          }
          className="h-9 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
        >
          <option value="ALL">All statuses</option>
          {(Object.keys(STATUS_LABEL) as VisitStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <span className="text-xs text-white/35 sm:ml-auto">{totalLabel}</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-white/40 text-xs uppercase tracking-wide border-b border-white/[0.06]">
              <th className="px-4 py-3 font-medium">Visit</th>
              <th className="px-4 py-3 font-medium">Company</th>
              <th className="px-4 py-3 font-medium">Rep</th>
              <th className="px-4 py-3 font-medium">Scheduled</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Verification</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {displayVisits.map((v) => (
              <VisitRow
                key={v.id}
                visit={v}
                showAssignee={true}
                showVerification={true}
                showMapLink={true}
                onStatusChange={(status) => updateVisitStatusAction(v.id, status)}
              />
            ))}
            {displayVisits.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-white/35">
                  No visits found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {isServerMode && props.result!.pageCount > 1 && (
        <div className="flex items-center justify-between gap-3 p-4 border-t border-white/[0.06]">
          <span className="text-xs text-white/40">
            Page {props.result!.page} of {props.result!.pageCount}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => updateParams({ page: String(props.result!.page - 1) })}
              disabled={props.result!.page <= 1}
              className="flex items-center gap-1 h-8 px-2.5 rounded-lg border border-white/[0.08] text-xs text-white/70 hover:bg-white/[0.05] disabled:opacity-30 disabled:pointer-events-none transition-colors"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Prev
            </button>
            <button
              onClick={() => updateParams({ page: String(props.result!.page + 1) })}
              disabled={props.result!.page >= props.result!.pageCount}
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
