'use client'

import * as React from 'react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import {
  AlertTriangle,
  RefreshCw,
  Users,
  MapPin,
  Navigation,
  Satellite,
  Crosshair,
  ShieldAlert,
  Clock3,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useFieldTracking } from '@/hooks/use-field-tracking'
import type { LiveMapVisit, VisitStatus, ActiveUserPin } from '@/types/field-sales'

// MapLibre raster style — OpenStreetMap tiles, no token needed.
// Using raster tiles as the primary style to avoid vector tile loading issues
// that can result in a black/blank map in restricted network environments.
const RASTER_FALLBACK_STYLE = {
  version: 8 as const,
  sources: {
    osm: {
      type: 'raster' as const,
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'osm', type: 'raster' as const, source: 'osm' }],
} as unknown as maplibregl.StyleSpecification

const STATUS_COLOR: Record<VisitStatus, string> = {
  SCHEDULED: '#6b7280',
  ON_THE_WAY: '#38bdf8',
  CHECKED_IN: '#34d399',
  IN_MEETING: '#a78bfa',
  COMPLETED: '#22c55e',
  CANCELLED: '#ef4444',
}
const STATUS_LABEL: Record<VisitStatus, string> = {
  SCHEDULED: 'Scheduled',
  ON_THE_WAY: 'On the way',
  CHECKED_IN: 'Checked in',
  IN_MEETING: 'In meeting',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
}

const POLL_INTERVAL_MS = 12_000

/** Deterministic per-name color — stable across reloads, distinct per user. */
function colorForName(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  const h = hash % 360
  // Keep saturation/lightness in a vivid band so dots pop on dark map
  return `hsl(${h} 72% 52%)`
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

function relTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const s = Math.floor((Date.now() - d.getTime()) / 1000)
  if (s < 5) return 'just now'
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return d.toLocaleString()
}

function formatAccuracy(m: number | null): string {
  if (m == null) return '—'
  if (m < 1000) return `±${Math.round(m)}m`
  return `±${(m / 1000).toFixed(1)}km`
}

function formatSpeed(mps: number | null): string {
  if (mps == null || !Number.isFinite(mps)) return '—'
  const kmh = mps * 3.6
  if (kmh < 1) return `${kmh.toFixed(1)} km/h`
  return `${Math.round(kmh)} km/h`
}

export function LiveMap({
  initialVisits,
  initialActiveUsers,
}: {
  initialVisits: LiveMapVisit[]
  initialActiveUsers: ActiveUserPin[]
}) {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const mapRef = React.useRef<maplibregl.Map | null>(null)
  const visitMarkersRef = React.useRef<Record<string, maplibregl.Marker>>({})
  const userMarkersRef = React.useRef<Record<string, { marker: maplibregl.Marker; el: HTMLDivElement }>>({})
  const [visits, setVisits] = React.useState(initialVisits)
  const [activeUsers, setActiveUsers] = React.useState(initialActiveUsers)
  const [lastUpdated, setLastUpdated] = React.useState<Date | null>(() => new Date())
  const [showActive, setShowActive] = React.useState(true)
  const [showVisits, setShowVisits] = React.useState(true)
  const [mapError, setMapError] = React.useState<string | null>(null)
  const mounted = true  // always true after initial render
  const [mapReady, setMapReady] = React.useState(false)
  const tracking = useFieldTracking()

  // ---- Map init (MapLibre, no token) — OpenStreetMap raster tiles ----
  const mountedRef = React.useRef(true)
  const resizeObserverRef = React.useRef<ResizeObserver | null>(null)
  React.useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])
  React.useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    let map: maplibregl.Map | null = null
    let raf = 0

    const init = () => {
      if (!mountedRef.current || !containerRef.current || mapRef.current) return
      const all = [
        ...initialVisits.map((v) => [v.longitude, v.latitude] as [number, number]),
        ...initialActiveUsers.map((u) => [u.longitude, u.latitude] as [number, number]),
      ]
      let center: [number, number] = [72.8777, 19.076] // Mumbai fallback
      if (initialVisits.length > 0) center = [initialVisits[0].longitude, initialVisits[0].latitude]
      else if (initialActiveUsers.length > 0) center = [initialActiveUsers[0].longitude, initialActiveUsers[0].latitude]

      try {
        map = new maplibregl.Map({
          container: containerRef.current!,
          style: RASTER_FALLBACK_STYLE,
          center,
          zoom: all.length > 0 ? 11 : 4,
          attributionControl: false,
          fadeDuration: 0,
        })
      } catch (err) {
        setMapError(String((err as Error)?.message ?? err).slice(0, 220))
        return
      }
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
      map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')

      map.on('error', (e: unknown) => {
        const msg = String((e as unknown as { error?: { message?: string } })?.error?.message ?? (e as Error)?.message ?? e)
        setMapError((prev) => (prev === msg.slice(0, 220) ? prev : msg.slice(0, 220)))
      })

      // Resize after container settles (fixes 0-size init when page transition animates)
      map.once('load', () => {
        try { map!.resize() } catch {}
        // Also set up ResizeObserver to handle container size changes
        if (containerRef.current && !resizeObserverRef.current) {
          resizeObserverRef.current = new ResizeObserver(() => {
            try { mapRef.current?.resize() } catch {}
          })
          resizeObserverRef.current.observe(containerRef.current)
        }
        // Force resize after a short delay as backup (handles cases where container
        // dimensions aren't ready at load time)
        setTimeout(() => { try { mapRef.current?.resize() } catch {} }, 100)
        setTimeout(() => { try { mapRef.current?.resize() } catch {} }, 500)
      })
      mapRef.current = map
      setMapReady(true)
    }

    // Defer to next frame so page paint + auth/queries settle first — avoids "Page Unresponsive"
    raf = requestAnimationFrame(() => { raf = requestAnimationFrame(init) })
    return () => {
      cancelAnimationFrame(raf)
      if (map) {
        try { map.remove() } catch {}
      }
      // Also handle case where map was assigned to ref after closure
      const refMap = mapRef.current
      if (refMap && refMap !== map) {
        try { refMap.remove() } catch {}
      }
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect()
        resizeObserverRef.current = null
      }
      mapRef.current = null
      setMapReady(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---- Visit markers (existing functionality unchanged) ----
  React.useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (!showVisits) {
      for (const m of Object.values(visitMarkersRef.current)) m.remove()
      visitMarkersRef.current = {}
      return
    }
    const seen = new Set<string>()
    for (const v of visits) {
      seen.add(v.id)
      const existing = visitMarkersRef.current[v.id]
      if (existing) {
        existing.setLngLat([v.longitude, v.latitude])
        continue
      }
      const el = document.createElement('div')
      el.style.width = '14px'
      el.style.height = '14px'
      el.style.borderRadius = '50%'
      el.style.border = '2px solid white'
      el.style.boxShadow = '0 2px 6px rgba(0,0,0,0.5)'
      el.style.backgroundColor = STATUS_COLOR[v.status]
      el.style.cursor = 'pointer'
      const popup = new maplibregl.Popup({ offset: 14 }).setHTML(
        `<div style="font-family:inherit;font-size:12px;color:#111;line-height:1.4"><strong>${escapeHtml(v.title)}</strong><br/>${v.companyName ? escapeHtml(v.companyName) + '<br/>' : ''}${v.address ? escapeHtml(v.address) + '<br/>' : ''}${STATUS_LABEL[v.status]} · ${escapeHtml(v.assignee)}</div>`
      )
      visitMarkersRef.current[v.id] = new maplibregl.Marker({ element: el }).setLngLat([v.longitude, v.latitude]).setPopup(popup).addTo(map)
    }
    for (const id of Object.keys(visitMarkersRef.current)) {
      if (!seen.has(id)) {
        visitMarkersRef.current[id].remove()
        delete visitMarkersRef.current[id]
      }
    }
  }, [visits, showVisits])

  // ---- Active-user markers: per-name color, smooth motion ----
  React.useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (!showActive) {
      for (const { marker } of Object.values(userMarkersRef.current)) marker.remove()
      userMarkersRef.current = {}
      return
    }
    const seen = new Set<string>()
    for (const u of activeUsers) {
      seen.add(u.id)
      const color = colorForName(u.name)
      const existing = userMarkersRef.current[u.id]
      if (existing) {
        // Smooth glide: CSS transition on the marker element's transform
        existing.el.style.background = color
        existing.el.style.opacity = u.isStale ? '0.45' : '1'
        existing.el.title = `${u.name} ${u.isTracking ? '· live' : u.isStale ? '· stale' : '· last check-in'}`
        existing.marker.setLngLat([u.longitude, u.latitude])
        // Update popup content without recreating marker
        const popupHtml = popupForUser(u)
        const popup = existing.marker.getPopup()
        if (popup) popup.setHTML(popupHtml)
        continue
      }
      const el = document.createElement('div')
      el.style.width = '30px'
      el.style.height = '30px'
      el.style.borderRadius = '50%'
      el.style.display = 'flex'
      el.style.alignItems = 'center'
      el.style.justifyContent = 'center'
      el.style.fontSize = '11px'
      el.style.fontWeight = '800'
      el.style.color = 'white'
      el.style.background = color
      el.style.border = '2px solid white'
      el.style.boxShadow = `0 2px 10px ${color}66`
      el.style.cursor = 'pointer'
      el.style.transition = 'transform 1.1s linear, opacity 0.4s ease'
      el.style.willChange = 'transform'
      el.style.opacity = u.isStale ? '0.45' : '1'
      el.style.textShadow = '0 1px 2px rgba(0,0,0,0.5)'
      el.textContent = u.initials
      el.title = `${u.name} ${u.isTracking ? '· live' : u.isStale ? '· stale' : '· last check-in'}`

      // Accuracy ring (subtle) and heading chevron
      const popup = new maplibregl.Popup({ offset: 18, closeButton: false }).setHTML(popupForUser(u))
      const marker = new maplibregl.Marker({ element: el, pitchAlignment: 'auto' })
        .setLngLat([u.longitude, u.latitude])
        .setPopup(popup)
        .addTo(map)

      // If heading available, add a small directional caret inside the dot
      if (u.heading != null && Number.isFinite(u.heading)) {
        const caret = document.createElement('span')
        caret.textContent = '▲'
        caret.style.position = 'absolute'
        caret.style.top = '-6px'
        caret.style.left = '50%'
        caret.style.transform = `translateX(-50%) rotate(${u.heading}deg)`
        caret.style.fontSize = '7px'
        caret.style.color = color
        caret.style.filter = 'drop-shadow(0 1px 1px rgba(0,0,0,0.6))'
        caret.style.pointerEvents = 'none'
        el.style.position = 'relative'
        el.appendChild(caret)
      }

      userMarkersRef.current[u.id] = { marker, el }
    }
    for (const id of Object.keys(userMarkersRef.current)) {
      if (!seen.has(id)) {
        userMarkersRef.current[id].marker.remove()
        delete userMarkersRef.current[id]
      }
    }
  }, [activeUsers, showActive])

  // ---- Poll live-map endpoint (visits + live locations) ----
  React.useEffect(() => {
    let cancelled = false
    const interval = setInterval(async () => {
      if (cancelled) return
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 8000)
      try {
        const res = await fetch('/api/field-sales/live-map', { cache: 'no-store', signal: ctrl.signal })
        if (!res.ok || cancelled) return
        const data = await res.json()
        if (cancelled) return
        if (Array.isArray(data)) {
          setVisits(data)
        } else {
          if (Array.isArray(data.visits)) setVisits(data.visits)
          if (Array.isArray(data.activeUsers)) setActiveUsers(data.activeUsers)
        }
        setLastUpdated(new Date())
      } catch {}
      finally { clearTimeout(t) }
    }, POLL_INTERVAL_MS)
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  return (
    <div className="space-y-3">
      {/* Field session tracking bar */}
      <FieldSessionBar tracking={tracking} />

      {/* Stale / error banners for tracking */}
      {tracking.status === 'denied' && (
        <div className="flex gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-200">
          <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            {tracking.error?.message ?? 'Location permission denied.'} Allow location for this site in your browser settings, then tap <strong>Retry</strong>.
          </span>
          <Button size="sm" variant="secondary" className="ml-auto h-7 shrink-0 text-xs" onClick={tracking.start}>
            Retry
          </Button>
        </div>
      )}
      {tracking.status === 'unavailable' && (
        <div className="flex gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-200">
          <Satellite className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{tracking.error?.message ?? 'GPS unavailable. Ensure location services are on and try outdoors.'}</span>
          <Button size="sm" variant="secondary" className="ml-auto h-7 shrink-0 text-xs" onClick={tracking.start}>
            Retry
          </Button>
        </div>
      )}
      {tracking.status === 'error' && tracking.error && (
        <div className="flex gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-xs text-red-200">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{tracking.error.message}</span>
          <Button size="sm" variant="secondary" className="ml-auto h-7 shrink-0 text-xs" onClick={tracking.start}>
            Retry
          </Button>
        </div>
      )}
      {mapError && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          Map tiles failed to load: {mapError} — check your network. Visit pins and tracking still work.
        </div>
      )}

      {/* Header row: refresh + toggles */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <span className="flex items-center gap-1.5 text-white/40" suppressHydrationWarning>
          <RefreshCw className="h-3 w-3" /> Live every ~12s · last sync {mounted && lastUpdated ? lastUpdated.toLocaleTimeString() : '—'}
        </span>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-white/70 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showActive}
              onChange={(e) => setShowActive(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-white/20 bg-white/10 accent-violet-600"
            />
            <Users className="h-3.5 w-3.5" /> Active reps ({activeUsers.filter((u) => !u.isStale).length}/{activeUsers.length})
          </label>
          <label className="flex items-center gap-1.5 text-white/70 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showVisits}
              onChange={(e) => setShowVisits(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-white/20 bg-white/10 accent-sky-600"
            />
            <MapPin className="h-3 w-3" /> Visits ({visits.length})
          </label>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-white/35">
        {(Object.keys(STATUS_LABEL) as VisitStatus[]).map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className={cn('h-2 w-2 rounded-full')} style={{ backgroundColor: STATUS_COLOR[s as VisitStatus] }} />
            {STATUS_LABEL[s as VisitStatus]}
          </span>
        ))}
        <span className="ml-2 hidden sm:inline text-white/20">|</span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full border border-white shadow-sm" style={{ background: 'hsl(260 72% 52%)' }} /> Rep dot (color = name)
        </span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-white/40" /> stale</span>
      </div>

      <div ref={containerRef} className="h-[560px] w-full rounded-xl border border-white/10 overflow-hidden relative" style={{ backgroundColor: '#0a0f1c' }}>
        {!mapReady && !mapError && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0a0f1c] text-white/30 text-xs gap-2 z-10">
            <RefreshCw className="h-4 w-4 animate-spin" /> Loading map…
          </div>
        )}
        {mapError && (
          <div className="absolute top-2 left-2 right-2 z-10 flex items-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/10 px-2.5 py-1.5 text-xs text-red-200">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            <span>Map tiles failed to load: {mapError} — check your network.</span>
          </div>
        )}
      </div>

      {/* Active now strip — per-name color, accuracy, last update, stale dimming */}
      {activeUsers.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold tracking-wide uppercase text-white/40">Active now</p>
            <span className="text-[11px] text-white/30 flex items-center gap-1">
              <Clock3 className="h-3 w-3" /> {activeUsers.filter((u) => u.isTracking).length} tracking · {activeUsers.filter((u) => u.isStale).length} stale
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {activeUsers.map((u) => {
              const c = colorForName(u.name)
              return (
                <span
                  key={u.id}
                  suppressHydrationWarning
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs',
                    u.isStale ? 'border-white/5 bg-white/[0.02] text-white/30' : 'border-white/10 bg-white/[0.04] text-white/70'
                  )}
                  title={mounted ? `${u.name} · ${u.updatedAt ? relTime(u.updatedAt) : relTime(u.lastSeenAt)} · ${formatAccuracy(u.accuracy)}${u.isTracking ? ' · live' : ''}${u.isStale ? ' · stale' : ''}` : u.name}
                >
                  <span
                    className="h-5 w-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center shrink-0 border border-white/20"
                    style={{ background: c }}
                  >
                    {u.initials}
                  </span>
                  <span className="font-medium">{u.name}</span>
                  {u.companyName ? <span className="text-white/30 hidden sm:inline">· {u.companyName}</span> : null}
                  <span
                    className={cn(
                      'ml-1 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold border',
                      u.isTracking
                        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20'
                        : u.isStale
                          ? 'bg-white/5 text-white/25 border-white/5'
                          : 'bg-white/5 text-white/40 border-white/10'
                    )}
                  >
                    <span className={cn('h-1.5 w-1.5 rounded-full', u.isTracking ? 'bg-emerald-400 animate-pulse' : u.isStale ? 'bg-white/20' : 'bg-white/30')} />
                    {u.isTracking ? 'live' : u.isStale ? 'stale' : 'idle'}
                  </span>
                  <span suppressHydrationWarning className="text-[11px] text-white/25 hidden sm:inline">
                    {mounted ? `${formatAccuracy(u.accuracy)} · ${u.updatedAt ? relTime(u.updatedAt) : relTime(u.lastCheckInAt ?? u.lastSeenAt)}` : formatAccuracy(u.accuracy)}
                  </span>
                </span>
              )
            })}
          </div>
          <p className="mt-2 text-[11px] text-white/20">
            Dot color is fixed per name. <span className="text-white/30">Live</span> = streaming every ~12s · <span className="text-white/30">Stale</span> = &gt;2 min since last ping or tracking stopped (dimmed). Each rep&apos;s dot glides smoothly as new fixes arrive.
          </p>
        </div>
      )}

      {activeUsers.length === 0 && visits.length === 0 && (
        <p className="text-center text-xs text-white/25 py-2">No visits or active reps yet. Schedule a visit or start a field session to appear on the map.</p>
      )}
    </div>
  )
}

function popupForUser(u: ActiveUserPin): string {
  const liveBadge = u.isTracking ? '<span style="display:inline-flex;align-items:center;gap:4px;background:#10b98115;color:#10b981;border:1px solid #10b98130;border-radius:9999px;padding:1px 6px;font-size:10px;font-weight:700">● live</span>' : u.isStale ? '<span style="display:inline-flex;align-items:center;gap:4px;background:#ffffff0a;color:#ffffff40;border:1px solid #ffffff10;border-radius:9999px;padding:1px 6px;font-size:10px;font-weight:600">stale</span>' : '<span style="display:inline-flex;background:#ffffff0a;color:#ffffff60;border:1px solid #ffffff12;border-radius:9999px;padding:1px 6px;font-size:10px">idle</span>'
  const headingLine = u.heading != null ? `Heading ${Math.round(u.heading)}° · ` : ''
  const speedLine = u.speed != null ? `Speed ${formatSpeed(u.speed)}<br/>` : ''
  return `<div style="font-family:inherit;font-size:12px;color:#111;line-height:1.45;min-width:180px">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
      <span style="width:22px;height:22px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;color:white;background:${escapeHtml(colorForName(u.name))};border:1.5px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.25)">${escapeHtml(u.initials)}</span>
      <strong>${escapeHtml(u.name)}</strong> ${liveBadge}
    </div>
    ${u.visitTitle ? `${escapeHtml(u.visitTitle)}<br/>` : ''}${u.companyName ? `<span style="color:#6b7280">${escapeHtml(u.companyName)}</span><br/>` : ''}
    <span style="color:#6b7280">${headingLine}Accuracy ${escapeHtml(formatAccuracy(u.accuracy))}</span><br/>
    ${speedLine}
    <span style="color:#6b7280;font-size:11px">Updated ${escapeHtml(u.updatedAt ? relTime(u.updatedAt) : relTime(u.lastSeenAt))}</span>
  </div>`
}

function FieldSessionBar({ tracking }: { tracking: ReturnType<typeof useFieldTracking> }) {
  const { status, lastPos, lastSentAt } = tracking
  const isLive = status === 'tracking' || status === 'paused'
  const acc = lastPos ? Math.round(lastPos.coords.accuracy) : null

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5">
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase text-white/50">
        <Navigation className={cn('h-3.5 w-3.5', isLive && 'text-emerald-400')} />
        Field session
      </span>

      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium',
          status === 'tracking'
            ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
            : status === 'paused'
              ? 'border-amber-500/20 bg-amber-500/10 text-amber-300'
              : status === 'requesting'
                ? 'border-sky-500/20 bg-sky-500/10 text-sky-300'
                : 'border-white/10 bg-white/5 text-white/50'
        )}
      >
        <span className={cn('h-1.5 w-1.5 rounded-full', status === 'tracking' ? 'bg-emerald-400 animate-pulse' : status === 'paused' ? 'bg-amber-400' : 'bg-white/30')} />
        {status === 'idle' && 'Off'}
        {status === 'requesting' && 'Requesting…'}
        {status === 'tracking' && 'Live'}
        {status === 'paused' && 'Paused (tab hidden)'}
        {status === 'denied' && 'Permission denied'}
        {status === 'unavailable' && 'GPS unavailable'}
        {status === 'error' && 'Error'}
      </span>

      {isLive && acc != null && (
        <span className="text-xs text-white/40 flex items-center gap-1">
          <Crosshair className="h-3 w-3" /> ±{acc}m
          {lastSentAt ? <span className="text-white/25">· sent {relTime(lastSentAt.toISOString())}</span> : null}
        </span>
      )}
      {isLive && lastPos?.coords.heading != null && Number.isFinite(lastPos.coords.heading) && (
        <span className="text-xs text-white/25 hidden sm:inline">· {Math.round(lastPos.coords.heading)}°</span>
      )}

      <div className="ml-auto flex items-center gap-1.5">
        {status === 'idle' || status === 'denied' || status === 'unavailable' || status === 'error' ? (
          <Button size="sm" onClick={tracking.start} className="h-7 gap-1.5 bg-violet-600 hover:bg-violet-500 text-white text-xs">
            <Satellite className="h-3.5 w-3.5" /> Start tracking
          </Button>
        ) : (
          <Button size="sm" variant="secondary" onClick={tracking.stop} className="h-7 gap-1.5 text-xs">
            Stop
          </Button>
        )}
      </div>

      {status === 'idle' && (
        <span className="w-full text-[11px] text-white/25 mt-1">
          Streams your location every ~12s via <code className="text-white/40">watchPosition</code> to the Live Map. Stops when you end the session or sign out. Others see your per-name colored dot glide in real time.
        </span>
      )}
    </div>
  )
}