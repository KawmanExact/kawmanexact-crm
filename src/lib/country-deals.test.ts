import { describe, it, expect } from 'vitest'
import { buildCountryDeals } from '@/lib/country-deals'
import type { CountryDealRow } from '@/lib/country-deals'

const fmt = (n: number) => `$${n.toFixed(0)}`

describe('buildCountryDeals', () => {
  it('returns an empty result set for no rows', () => {
    const r = buildCountryDeals([], fmt)
    expect(r.slices).toEqual([])
    expect(r.markers).toEqual([])
    expect(r.totalDeals).toBe(0)
    expect(r.totalValue).toBe(0)
    expect(r.unlocatedDeals).toBe(0)
  })

  describe('merging', () => {
    it('merges variant spellings of one country into a single slice + marker', () => {
      const rows: CountryDealRow[] = [
        { country: 'India', count: 5, value: 500 },
        { country: 'india', count: 3, value: 300 },
        { country: 'IN', count: 2, value: 200 },
        { country: 'Bharat', count: 1, value: 100 },
      ]
      const r = buildCountryDeals(rows, fmt, 7)

      expect(r.slices).toHaveLength(1)
      const india = r.slices[0]
      expect(india.name).toBe('India')
      expect(india.count).toBe(11)
      expect(india.value).toBe(1100)
      expect(india.formatted).toBe(fmt(1100))
      expect(india.isOther).toBe(false)
      expect(india.isNotSpecified).toBe(false)
      expect(india.percentage).toBe(100)

      expect(r.markers).toHaveLength(1)
      expect(r.markers[0].name).toBe('India')
      expect(r.markers[0].color).toBe(india.color)

      expect(r.totalDeals).toBe(11)
      expect(r.totalValue).toBe(1100)
      expect(r.unlocatedDeals).toBe(0)
    })

    it('sums value from the merged rows, including across spellings', () => {
      const rows: CountryDealRow[] = [
        { country: 'USA', count: 4, value: 400 },
        { country: 'United States', count: 6, value: 600 },
      ]
      const r = buildCountryDeals(rows, fmt, 7)
      const us = r.slices[0]
      expect(us.count).toBe(10)
      expect(us.value).toBe(1000)
      expect(r.totalValue).toBe(1000)
      expect(r.totalDeals).toBe(10)
    })
  })

  describe('ordering and colors', () => {
    const rows: CountryDealRow[] = [
      { country: 'India', count: 10, value: 100 },
      { country: 'United States', count: 9, value: 90 },
      { country: 'Germany', count: 8, value: 80 },
      { country: 'Brazil', count: 7, value: 70 },
      { country: 'Japan', count: 6, value: 60 },
      { country: 'Canada', count: 5, value: 50 },
      { country: 'Australia', count: 4, value: 40 },
      { country: 'China', count: 3, value: 30 },
    ]

    it('orders top-N slices by deal count descending', () => {
      const r = buildCountryDeals(rows, fmt, 5)
      expect(r.slices.slice(0, 5).map((s) => s.count)).toEqual([10, 9, 8, 7, 6])
    })

    it('each of the top-N gets a distinct colour', () => {
      const r = buildCountryDeals(rows, fmt, 5)
      const top = r.slices.slice(0, 5)
      const colors = new Set(top.map((s) => s.color))
      expect(colors.size).toBe(5)
    })

    it('shares the slice colour with its map dot', () => {
      const r = buildCountryDeals(rows, fmt, 5)
      for (let i = 0; i < 5; i++) {
        expect(r.markers[i].color).toBe(r.slices[i].color)
        expect(r.markers[i].name).toBe(r.slices[i].name)
      }
    })
  })

  describe('Other folding', () => {
    it('folds countries beyond topN into one grey "Other" slice but keeps grey dots per country', () => {
      const rows: CountryDealRow[] = [
        { country: 'India', count: 10, value: 100 },
        { country: 'Germany', count: 9, value: 90 },
        { country: 'Brazil', count: 5, value: 50 },
        { country: 'Japan', count: 4, value: 40 },
        { country: 'Canada', count: 3, value: 30 },
      ]
      const r = buildCountryDeals(rows, fmt, 2)

      expect(r.totalDeals).toBe(31)
      expect(r.totalValue).toBe(310)
      // 2 coloured + 1 Other
      expect(r.slices).toHaveLength(3)
      expect(r.slices[0].name).toBe('India')
      expect(r.slices[1].name).toBe('Germany')

      const other = r.slices[2]
      expect(other.isOther).toBe(true)
      expect(other.name).toBe('Other (12)')
      expect(other.count).toBe(12)
      expect(other.value).toBe(120)
      expect(other.color).toBe('#6b7280')
      expect(other.percentage).toBe(Math.round((12 / 31) * 100))

      // every plottable country still has its own dot
      expect(r.markers).toHaveLength(5)
      const grey = r.markers.filter((m) => m.color === '#6b7280')
      expect(grey.map((m) => m.name).sort()).toEqual(['Brazil', 'Canada', 'Japan'])
      // coloured dots match their slices
      expect(r.markers[0].color).toBe(r.slices[0].color)
      expect(r.markers[1].color).toBe(r.slices[1].color)
    })

    it('omits the Other slice when there are no overflow countries', () => {
      const rows: CountryDealRow[] = [
        { country: 'India', count: 10, value: 100 },
        { country: 'Germany', count: 9, value: 90 },
      ]
      const r = buildCountryDeals(rows, fmt, 7)
      expect(r.slices.every((s) => !s.isOther)).toBe(true)
      expect(r.slices).toHaveLength(2)
    })
  })

  describe('Not specified', () => {
    it('groups blank / unrecognised countries into a Not specified slice and never plots them', () => {
      const rows: CountryDealRow[] = [
        { country: 'India', count: 5, value: 500 },
        { country: 'Atlantis', count: 2, value: 0 },
        { country: null, count: 3, value: 0 },
        { country: '   ', count: 1, value: 0 },
      ]
      const r = buildCountryDeals(rows, fmt, 7)

      expect(r.totalDeals).toBe(11)
      expect(r.totalValue).toBe(500)
      expect(r.unlocatedDeals).toBe(6)

      const ns = r.slices.find((s) => s.isNotSpecified)
      expect(ns).toBeTruthy()
      expect(ns!.count).toBe(6)
      expect(ns!.value).toBe(0)
      expect(ns!.formatted).toBe(fmt(0))
      expect(ns!.color).toBe('#6b7280')
      expect(ns!.percentage).toBe(Math.round((6 / 11) * 100))

      // India is plotted, Not specified is not
      expect(r.slices.find((s) => s.name === 'India')?.count).toBe(5)
      expect(r.markers.map((m) => m.name)).toEqual(['India'])
      expect(r.markers.find((m) => m.name === 'Not specified')).toBeUndefined()
    })
  })

  describe('percentages and totals', () => {
    it('computes percentages off the grand total (including unlocated)', () => {
      const rows: CountryDealRow[] = [
        { country: 'India', count: 8, value: 800 },
        { country: 'Brazil', count: 2, value: 200 },
      ]
      const r = buildCountryDeals(rows, fmt, 7)
      expect(r.slices[0].percentage).toBe(80)
      expect(r.slices[1].percentage).toBe(20)
    })
  })
})
