import { resolveCountry, type CountryInfo } from '@/lib/countries'
import type { CountryDealSlice, CountryDealMarker, CountryDealsData } from '@/types/dashboard'

export interface CountryDealRow {
  country: string | null | undefined
  count: number
  value: number
}

const COUNTRY_COLORS = ['#38bdf8', '#34d399', '#fb923c', '#f472b6', '#facc15', '#818cf8', '#f87171', '#a78bfa', '#22c55e', '#eab308']
const GREY = '#6b7280'

function pct(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0
}

/**
 * Merge grouped deal rows by resolved country.
 *
 * - topN countries (by deal count) each get their own colour.
 * - the remaining plottable countries fold into one grey "Other (n)" slice, but
 *   each keeps its own grey dot on the map.
 * - blank / unrecognised countries form a "Not specified" slice and are NEVER
 *   plotted (we never guess a location).
 *
 * Colors are shared between a country's pie slice and its map dot.
 */
export function buildCountryDeals(
  rows: CountryDealRow[],
  formatValue: (value: number) => string,
  topN = 7,
): CountryDealsData {
  if (rows.length === 0) {
    return { slices: [], markers: [], totalDeals: 0, totalValue: 0, unlocatedDeals: 0 }
  }

  const merged = new Map<string, { country: CountryInfo; count: number; value: number }>()
  let unlocatedDeals = 0
  let unlocatedValue = 0

  for (const row of rows) {
    const count = row.count > 0 ? row.count : 0
    const value = row.value > 0 ? row.value : 0
    const resolved = resolveCountry(row.country)
    if (!resolved) {
      unlocatedDeals += count
      unlocatedValue += value
      continue
    }
    const existing = merged.get(resolved.iso2)
    if (existing) {
      existing.count += count
      existing.value += value
    } else {
      merged.set(resolved.iso2, { country: resolved, count, value })
    }
  }

  const sorted = [...merged.values()].sort((a, b) => b.count - a.count)
  const top = sorted.slice(0, topN)
  const rest = sorted.slice(topN)

  const totalDeals = sorted.reduce((s, c) => s + c.count, 0) + unlocatedDeals
  const totalValue = sorted.reduce((s, c) => s + c.value, 0) + unlocatedValue

  const slices: CountryDealSlice[] = []
  const markers: CountryDealMarker[] = []

  for (let i = 0; i < top.length; i++) {
    const m = top[i]
    const color = COUNTRY_COLORS[i % COUNTRY_COLORS.length]
    slices.push({
      name: m.country.name,
      iso2: m.country.iso2,
      count: m.count,
      value: m.value,
      formatted: formatValue(m.value),
      color,
      percentage: pct(m.count, totalDeals),
      isOther: false,
      isNotSpecified: false,
    })
    markers.push({
      name: m.country.name,
      iso2: m.country.iso2,
      lat: m.country.lat,
      lng: m.country.lng,
      count: m.count,
      value: m.value,
      formatted: formatValue(m.value),
      color,
    })
  }

  if (rest.length > 0) {
    const restCount = rest.reduce((s, c) => s + c.count, 0)
    const restValue = rest.reduce((s, c) => s + c.value, 0)
    slices.push({
      name: 'Other (' + restCount + ')',
      iso2: null,
      count: restCount,
      value: restValue,
      formatted: formatValue(restValue),
      color: GREY,
      percentage: pct(restCount, totalDeals),
      isOther: true,
      isNotSpecified: false,
    })
    for (const m of rest) {
      markers.push({
        name: m.country.name,
        iso2: m.country.iso2,
        lat: m.country.lat,
        lng: m.country.lng,
        count: m.count,
        value: m.value,
        formatted: formatValue(m.value),
        color: GREY,
      })
    }
  }

  if (unlocatedDeals > 0) {
    slices.push({
      name: 'Not specified',
      iso2: null,
      count: unlocatedDeals,
      value: unlocatedValue,
      formatted: formatValue(unlocatedValue),
      color: GREY,
      percentage: pct(unlocatedDeals, totalDeals),
      isOther: false,
      isNotSpecified: true,
    })
  }

  return { slices, markers, totalDeals, totalValue, unlocatedDeals }
}
