'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { useShallow } from 'zustand/react/shallow'
import { Search, User, Building2, Contact as ContactIcon, Handshake, CalendarClock, FileText, Loader2, AlertCircle, LogIn } from 'lucide-react'
import { useUIStore } from '@/stores/ui'
import type { SearchResult, SearchResultType } from '@/services/search.service'

const TYPE_ICON: Record<SearchResultType, typeof User> = {
  lead: User,
  company: Building2,
  contact: ContactIcon,
  deal: Handshake,
  meeting: CalendarClock,
  file: FileText,
}

const TYPE_LABEL: Record<SearchResultType, string> = {
  lead: 'Leads',
  company: 'Companies',
  contact: 'Contacts',
  deal: 'Deals',
  meeting: 'Meetings',
  file: 'Files',
}

const GROUP_ORDER: SearchResultType[] = ['lead', 'company', 'contact', 'deal', 'meeting', 'file']

type FetchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; results: SearchResult[] }
  | { status: 'unauthenticated' }
  | { status: 'rate_limited'; retryAfter?: string }
  | { status: 'error'; message: string }

async function fetchResults(query: string): Promise<FetchState> {
  if (query.trim().length < 2) return { status: 'idle' }
  const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`)
  if (res.status === 401) return { status: 'unauthenticated' }
  if (res.status === 429) {
    const retryAfter = res.headers.get('Retry-After') ?? undefined
    return { status: 'rate_limited', retryAfter }
  }
  if (!res.ok) {
    let msg = `Search failed (${res.status}).`
    try {
      const body = (await res.json()) as { error?: string }
      if (body?.error) msg = body.error
    } catch {}
    return { status: 'error', message: msg }
  }
  const data = (await res.json()) as SearchResult[]
  return { status: 'ok', results: Array.isArray(data) ? data : [] }
}

/**
 * Global Cmd+K search (audit: "Advanced Search — Only client-side filter
 * on current page data"). The trigger button, keyboard shortcut, and
 * open/close state (useUIStore.commandPaletteOpen) already existed —
 * nothing ever rendered when it opened. This is that missing piece.
 */
export function CommandPalette() {
  const router = useRouter()
  const { commandPaletteOpen, setCommandPaletteOpen } = useUIStore(
    useShallow((s) => ({
      commandPaletteOpen: s.commandPaletteOpen,
      setCommandPaletteOpen: s.setCommandPaletteOpen,
    }))
  )
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const { data: state = { status: 'idle' } as FetchState, isFetching } = useQuery<FetchState>({
    queryKey: ['global-search', query],
    queryFn: () => fetchResults(query),
    enabled: commandPaletteOpen && query.trim().length >= 2,
    // Don't silently cache an unauthenticated response — next successful login should refetch.
    gcTime: 0,
  })

  const results = state.status === 'ok' ? state.results : []
  const fetchError = state.status === 'unauthenticated' || state.status === 'rate_limited' || state.status === 'error' ? state : null

  // Reset the query/selection whenever the palette transitions from closed -> open.
  const wasOpenRef = useRef(commandPaletteOpen)
  useEffect(() => {
    const wasOpen = wasOpenRef.current
    wasOpenRef.current = commandPaletteOpen
    if (!wasOpen && commandPaletteOpen) {
      setQuery('')
      setActiveIndex(0)
    }
  }, [commandPaletteOpen])

  const wasOpenForFocusRef = useRef(commandPaletteOpen)
  useEffect(() => {
    const wasOpen = wasOpenForFocusRef.current
    wasOpenForFocusRef.current = commandPaletteOpen
    if (!wasOpen && commandPaletteOpen) {
      const frame = requestAnimationFrame(() => {
        inputRef.current?.focus()
      })
      return () => cancelAnimationFrame(frame)
    }
  }, [commandPaletteOpen])

  const safeActiveIndex = results.length === 0 ? 0 : Math.min(activeIndex, results.length - 1)

  function close() {
    setCommandPaletteOpen(false)
  }

  function go(result: SearchResult) {
    close()
    router.push(result.href)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      close()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && results[safeActiveIndex]) {
      e.preventDefault()
      go(results[safeActiveIndex])
    }
  }

  if (!commandPaletteOpen) return null

  const grouped = GROUP_ORDER.map((type) => ({
    type,
    items: results.filter((r) => r.type === type),
  })).filter((g) => g.items.length > 0)

  const flatIndexById = new Map<string, number>()
  let cursor = 0
  for (const group of grouped) {
    for (const item of group.items) {
      flatIndexById.set(`${item.type}-${item.id}`, cursor)
      cursor += 1
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/60 pt-[12vh] px-4" onClick={close}>
      <div
        className="w-full max-w-lg rounded-xl border border-white/10 bg-[#0a111c] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-white/[0.06]">
          {isFetching ? (
            <Loader2 className="h-4 w-4 text-white/40 animate-spin shrink-0" />
          ) : (
            <Search className="h-4 w-4 text-white/40 shrink-0" />
          )}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search leads, companies, contacts, deals, meetings, files…"
            className="flex-1 bg-transparent text-sm text-white placeholder:text-white/30 focus:outline-none"
          />
          <kbd className="hidden sm:inline-flex rounded border border-white/10 bg-white/[0.06] px-1.5 py-0.5 text-[11px] text-white/40">
            Esc
          </kbd>
        </div>

        <div className="max-h-[60vh] overflow-y-auto py-2">
          {query.trim().length < 2 && !fetchError && (
            <p className="px-4 py-8 text-center text-sm text-white/30">Type at least 2 characters to search.</p>
          )}

          {fetchError?.status === 'unauthenticated' && (
            <div className="px-4 py-6 text-center">
              <p className="text-sm text-red-300 flex items-center justify-center gap-2">
                <AlertCircle className="h-4 w-4" /> Not signed in — please log in.
              </p>
              <a href="/login" className="inline-flex items-center gap-1.5 mt-3 text-sm text-purple-300 hover:text-purple-200 font-medium">
                <LogIn className="h-4 w-4" /> Go to login
              </a>
            </div>
          )}

          {fetchError?.status === 'rate_limited' && (
            <div className="px-4 py-6 text-center">
              <p className="text-sm text-amber-300 flex items-center justify-center gap-2">
                <AlertCircle className="h-4 w-4" /> Too many searches — slow down.
              </p>
              {fetchError.retryAfter && (
                <p className="text-xs text-white/40 mt-1">Retry after {fetchError.retryAfter}s.</p>
              )}
            </div>
          )}

          {fetchError?.status === 'error' && (
            <div className="px-4 py-6 text-center">
              <p className="text-sm text-red-300 flex items-center justify-center gap-2">
                <AlertCircle className="h-4 w-4" /> {fetchError.message}
              </p>
              <button onClick={() => setQuery((q) => q + ' ')} className="mt-3 text-sm text-purple-300 hover:text-purple-200 font-medium">
                Retry
              </button>
            </div>
          )}

          {!fetchError && query.trim().length >= 2 && !isFetching && results.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-white/30">No results for &ldquo;{query}&rdquo;.</p>
          )}

          {grouped.map((group) => (
            <div key={group.type} className="mb-1">
              <p className="px-4 pt-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-white/30">
                {TYPE_LABEL[group.type]}
              </p>
              {group.items.map((item) => {
                const key = `${item.type}-${item.id}`
                const flatIndex = flatIndexById.get(key)!
                const isActive = flatIndex === safeActiveIndex
                const Icon = TYPE_ICON[item.type]
                return (
                  <button
                    key={key}
                    onClick={() => go(item)}
                    onMouseEnter={() => setActiveIndex(flatIndex)}
                    className={`flex w-full items-center gap-3 px-4 py-2 text-left transition-colors ${
                      isActive ? 'bg-purple-500/15' : 'hover:bg-white/[0.04]'
                    }`}
                  >
                    <Icon className="h-4 w-4 text-white/40 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm text-white truncate">{item.title}</p>
                      <p className="text-xs text-white/40 truncate">{item.subtitle}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
