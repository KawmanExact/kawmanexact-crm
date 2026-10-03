'use client'

import Link from 'next/link'
import * as React from 'react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { LiveVisitMarker } from '@/types/dashboard'

const STATUS_COLOR: Record<LiveVisitMarker['status'], string> = {
  'In Meeting': 'bg-purple-400',
  'Checked-in': 'bg-emerald-400',
  'On the way': 'bg-blue-400',
  'Checked-out': 'bg-white/40',
}

// MapLibre raster style — OpenStreetMap tiles, no token needed.
// Using raster tiles as the primary style to avoid vector tile loading issues
// that can result in a black/blank map in restricted network environments.
const MAP_STYLE = {
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

function markerColor(status: LiveVisitMarker['status']): string {
  const map: Record<LiveVisitMarker['status'], string> = {
    'In Meeting': '#a78bfa',
    'Checked-in': '#34d399',
    'On the way': '#38bdf8',
    'Checked-out': '#9ca3af',
  }
  return map[status] ?? '#38bdf8'
}

export function LiveMapCard({ markers }: { markers: LiveVisitMarker[] }) {
  const mapContainerRef = React.useRef<HTMLDivElement>(null)
  const mapInstanceRef = React.useRef<maplibregl.Map | null>(null)
  const markersRef = React.useRef<maplibregl.Marker[]>([])
  const resizeObserverRef = React.useRef<ResizeObserver | null>(null)

  React.useEffect(() => {
    if (!mapContainerRef.current) return
    if (mapInstanceRef.current) return

    const firstValid = markers.find(
      (m) =>
        typeof m.longitude === 'number' &&
        typeof m.latitude === 'number' &&
        !Number.isNaN(m.longitude) &&
        !Number.isNaN(m.latitude)
    )
    const center: [number, number] = firstValid
      ? [firstValid.longitude, firstValid.latitude]
      : [72.8777, 19.076]

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: MAP_STYLE,
      center,
      zoom: markers.length > 1 ? 2 : 4,
      attributionControl: false,
      fadeDuration: 0,
    })

    // Set up ResizeObserver to handle container size changes
    resizeObserverRef.current = new ResizeObserver(() => {
      try { mapInstanceRef.current?.resize() } catch {}
    })
    resizeObserverRef.current.observe(mapContainerRef.current)

    // Force resize after load and after short delays
    map.once('load', () => {
      try { map.resize() } catch {}
      setTimeout(() => { try { map.resize() } catch {} }, 100)
      setTimeout(() => { try { map.resize() } catch {} }, 500)
    })

    mapInstanceRef.current = map

    return () => {
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect()
        resizeObserverRef.current = null
      }
      for (const m of markersRef.current) m.remove()
      markersRef.current = []
      map.remove()
      mapInstanceRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  React.useEffect(() => {
    const map = mapInstanceRef.current
    if (!map) return

    for (const m of markersRef.current) m.remove()
    markersRef.current = []

    const validMarkers = markers.filter(
      (m) =>
        typeof m.longitude === 'number' &&
        typeof m.latitude === 'number' &&
        !Number.isNaN(m.longitude) &&
        !Number.isNaN(m.latitude)
    )
    if (validMarkers.length === 0) return

    const bounds = new maplibregl.LngLatBounds()
    for (const m of validMarkers) {
      bounds.extend([m.longitude, m.latitude])
    }
    if (validMarkers.length > 1) {
      const center = bounds.getCenter()
      if (!Number.isNaN(center.lng) && !Number.isNaN(center.lat)) {
        map.flyTo({ center, zoom: 2 })
      }
    }

    for (const m of validMarkers) {
      const el = document.createElement('div')
      el.className = 'rounded-full border-2 border-white shadow-lg'
      el.style.width = '10px'
      el.style.height = '10px'
      el.style.backgroundColor = markerColor(m.status)

      const popup = new maplibregl.Popup({ offset: 8, closeButton: false }).setHTML(
        `<div style="font-family:inherit;font-size:11px;color:#111;line-height:1.4"><strong>${m.name}</strong><br/><span style="color:${markerColor(m.status)};">${m.status}</span></div>`
      )

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([m.longitude, m.latitude])
        .setPopup(popup)
        .addTo(map)

      markersRef.current.push(marker)
    }
  }, [markers])

  return (
    <Card className="bg-[#0a111c]/80 border-white/[0.08]">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base font-semibold">Live Visit Map</CardTitle>
        <Link
          href="/field-sales/live-map"
          className="text-sm text-purple-400 hover:text-purple-300 transition-colors"
        >
          View full map
        </Link>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-[1.3fr_1fr] gap-4">
           <div
             ref={mapContainerRef}
             className="relative h-48 rounded-xl border border-white/[0.06] overflow-hidden"
             style={{ backgroundColor: '#07101b' }}
           />

          <div className="space-y-2">
            {markers.map((marker) => (
              <div key={marker.id} className="flex items-center gap-2">
                <span className={cn('h-2 w-2 rounded-full shrink-0', STATUS_COLOR[marker.status])} />
                <div className="min-w-0">
                  <p className="text-sm text-white truncate">{marker.name}</p>
                  <p className="text-xs text-white/45">{marker.status}</p>
                </div>
              </div>
            ))}
            {markers.length === 0 && <p className="text-sm text-white/40">No active visits today.</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
