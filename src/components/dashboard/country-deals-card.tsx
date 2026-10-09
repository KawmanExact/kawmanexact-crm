'use client'

import * as React from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCompactCurrency } from '@/lib/currency'
import { MAP_STYLE } from '@/components/dashboard/live-map-card'
import type { CountryDealsData, CountryDealMarker } from '@/types/dashboard'

type Metric = 'deals' | 'value'

const DEFAULT_CENTER: [number, number] = [78.96, 20.59]

function dotSize(metricValue: number, maxMetric: number): number {
  if (maxMetric <= 0) return 12
  const ratio = metricValue / maxMetric
  const size = 12 + (34 - 12) * Math.sqrt(ratio)
  return Math.round(Math.min(34, Math.max(12, size)))
}

function valuePct(value: number, total: number): number {
  return total > 0 ? Math.round((value / total) * 100) : 0
}

export function CountryDealsCard({ countryDeals }: { countryDeals?: CountryDealsData }) {
  const data = countryDeals ?? { slices: [], markers: [], totalDeals: 0, totalValue: 0, unlocatedDeals: 0 }
  const { slices, markers, totalDeals, totalValue, unlocatedDeals } = data
  const [metric, setMetric] = React.useState<Metric>('deals')

  const mapContainerRef = React.useRef<HTMLDivElement>(null)
  const mapInstanceRef = React.useRef<maplibregl.Map | null>(null)
  const markersRef = React.useRef<maplibregl.Marker[]>([])
  const resizeObserverRef = React.useRef<ResizeObserver | null>(null)

  React.useEffect(() => {
    if (!mapContainerRef.current) return
    if (mapInstanceRef.current) return

    const center: [number, number] =
      markers.length > 0 ? [markers[0].lng, markers[0].lat] : DEFAULT_CENTER
    const zoom = markers.length > 1 ? 2 : markers.length === 1 ? 3.5 : 2

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: MAP_STYLE,
      center,
      zoom,
      attributionControl: false,
      fadeDuration: 0,
    })

    resizeObserverRef.current = new ResizeObserver(() => {
      try {
        mapInstanceRef.current?.resize()
      } catch {}
    })
    resizeObserverRef.current.observe(mapContainerRef.current)

    map.once('load', () => {
      try {
        map.resize()
      } catch {}
      setTimeout(() => {
        try {
          map.resize()
        } catch {}
      }, 100)
      setTimeout(() => {
        try {
          map.resize()
        } catch {}
      }, 500)
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

    if (markers.length === 0) return

    const metricKey = metric === 'deals' ? (m: CountryDealMarker) => m.count : (m: CountryDealMarker) => m.value
    const maxMetric = Math.max(...markers.map(metricKey), 0)

    const bounds = new maplibregl.LngLatBounds()
    for (const m of markers) {
      bounds.extend([m.lng, m.lat])
    }
    if (markers.length > 1) {
      const center = bounds.getCenter()
      if (!Number.isNaN(center.lng) && !Number.isNaN(center.lat)) {
        map.fitBounds(bounds, { padding: 40, maxZoom: 4 })
      }
    } else {
      map.flyTo({ center: [markers[0].lng, markers[0].lat], zoom: 3.5 })
    }

    for (const m of markers) {
      const size = dotSize(metricKey(m), maxMetric)
      const el = document.createElement('div')
      el.className = 'rounded-full border-2 border-white shadow-lg'
      el.style.width = `${size}px`
      el.style.height = `${size}px`
      el.style.backgroundColor = m.color

      const popupContent = document.createElement('div')
      popupContent.className = 'country-popup'
      const titleEl = document.createElement('div')
      titleEl.className = 'font-medium text-[11px] text-white break-all'
      titleEl.textContent = m.name + (m.iso2 ? ' (' + m.iso2 + ')' : '')
      const detailEl = document.createElement('div')
      detailEl.className = 'text-[10px] text-white/70 mt-0.5'
      detailEl.textContent = `${m.count} deal${m.count === 1 ? '' : 's'} \u00b7 ${m.formatted}`
      popupContent.appendChild(titleEl)
      popupContent.appendChild(detailEl)

      const popup = new maplibregl.Popup({ offset: 10, closeButton: true }).setDOMContent(popupContent)

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([m.lng, m.lat])
        .setPopup(popup)
        .addTo(map)

      markersRef.current.push(marker)
    }
  }, [markers, metric])

  const dataKey = metric === 'deals' ? 'count' : 'value'
  const centerTotal = metric === 'deals' ? String(totalDeals) : formatCompactCurrency(totalValue)
  const centerLabel = metric === 'deals' ? 'Total Deals' : 'Total Value'

  const showChart = slices.length > 0
  const showMap = markers.length > 0

  return (
    <Card className="bg-[#0a111c]/80 border-white/[0.08]">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base font-semibold">Deals by Country</CardTitle>
        <div className="flex items-center bg-white/[0.06] rounded-md p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setMetric('deals')}
            className={cn(
              'px-2.5 py-1 rounded transition-colors',
              metric === 'deals' ? 'bg-purple-500 text-white' : 'text-white/50 hover:text-white',
            )}
          >
            Deals
          </button>
          <button
            type="button"
            onClick={() => setMetric('value')}
            className={cn(
              'px-2.5 py-1 rounded transition-colors',
              metric === 'value' ? 'bg-purple-500 text-white' : 'text-white/50 hover:text-white',
            )}
          >
            Value
          </button>
        </div>
      </CardHeader>

      <CardContent>
        {totalDeals === 0 ? (
          <div className="py-8 text-center text-white/50">No deals recorded yet.</div>
        ) : (
          <div className="flex flex-col xl:flex-row items-stretch gap-6">
            {/* Donut + legend */}
            <div className="flex flex-col items-center w-full xl:w-[180px]">
              {showChart && (
                <div className="relative h-40 w-40" style={{ maxWidth: '160px', maxHeight: '160px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={slices}
                        dataKey={dataKey}
                        nameKey="name"
                        innerRadius={52}
                        outerRadius={72}
                        paddingAngle={2}
                        stroke="none"
                      >
                        {slices.map((slice) => (
                          <Cell key={slice.name + slice.color} fill={slice.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className="text-2xl font-bold text-white">{centerTotal}</span>
                      <span className="text-[11px] text-white/45">{centerLabel}</span>
                    </div>
                  </div>
                )}
              {metric === 'value' && totalValue === 0 && (
                <span className="text-[11px] text-white/50 mt-2">No deal value recorded.</span>
              )}

              <div className="flex-1 min-w-0 space-y-2.5 mt-4 xl:mt-0">
                {slices
                  .filter((slice) => (metric === 'deals' ? slice.count : slice.value) > 0)
                  .map((slice) => (
                    <div key={slice.name} className="flex items-center justify-between text-sm min-w-0">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: slice.color }} />
                        <span className="text-white/75 truncate">{slice.name}</span>
                      </div>
                      <span className="text-white/60 whitespace-nowrap ml-3 shrink-0">
                        {metric === 'deals' ? slice.count : slice.formatted}{' '}
                        ({metric === 'deals' ? slice.percentage : valuePct(slice.value, totalValue)}%)
                      </span>
                    </div>
                  ))}
              </div>
            </div>

            {/* Map */}
            <div className="relative flex-1 min-h-[280px] sm:min-h-[320px]">
              <div
                ref={mapContainerRef}
                className="w-full h-[280px] sm:h-[320px] rounded-lg border-0 overflow-hidden"
                style={{ backgroundColor: '#07101b' }}
              />
              {!showMap && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div
                    className="bg-[#0d1622]/90 backdrop-blur-sm border border-white/10 rounded-lg px-4 py-2 text-sm text-white/60 text-center"
                    style={{ pointerEvents: 'none' }}
                  >
                    {unlocatedDeals > 0
                      ? `${unlocatedDeals} deals could not be placed on the map — no recognised country.`
                      : 'No plottable countries.'}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="mt-3 text-xs text-white/40">
          {unlocatedDeals} deals not plotted on the map.
        </div>
      </CardContent>
    </Card>
  )
}
