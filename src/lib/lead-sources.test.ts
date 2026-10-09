import { describe, it, expect } from 'vitest'
import { buildLeadSources, normalizeSource } from '@/lib/lead-sources'
import type { LeadSourceRow } from '@/lib/lead-sources'
import { LEAD_SOURCE_PALETTE, OTHER_COLOR, TOP_N } from '@/lib/lead-sources'

const rows = (entries: Array<[string | null, number]>): LeadSourceRow[] =>
  entries.map(([source, count]) => ({ source, count }))

describe('normalizeSource', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeSource('  Referral   ')).toBe('Referral')
    expect(normalizeSource('a   b\tc')).toBe('a b c')
  })
  it('returns "" for null / undefined / blank', () => {
    expect(normalizeSource(null)).toBe('')
    expect(normalizeSource(undefined)).toBe('')
    expect(normalizeSource('   ')).toBe('')
  })
})

describe('buildLeadSources', () => {
  it('merges case / whitespace variants, keeping the most common spelling', () => {
    const r = buildLeadSources(
      rows([
        ['Referral', 3],
        ['  referral', 5],
        ['REFERRAL', 2],
      ]),
    )
    expect(r.sources).toHaveLength(1)
    const s = r.sources[0]
    expect(s.name).toBe('referral') // most common original (5)
    expect(s.count).toBe(10)
    expect(r.total).toBe(10)
  })

  it('normalises blank / null sources to "Unknown"', () => {
    const r = buildLeadSources(rows([[null, 4], ['   ', 1], ['', 2], ['Ads', 6]]))
    expect(r.sources.map((s) => s.name).sort()).toEqual(['Ads', 'Unknown'])
    const unknown = r.sources.find((s) => s.name === 'Unknown')!
    expect(unknown.count).toBe(7)
    expect(r.total).toBe(13)
  })

  it('keeps the top-N and folds the rest into one grey Other slice', () => {
    const r = buildLeadSources(
      rows([
        ['A', 10],
        ['B', 9],
        ['C', 8],
        ['D', 7],
        ['E', 6],
        ['F', 5],
        ['G', 4],
        ['H', 3],
        ['I', 2],
        ['J', 1],
      ]),
    )
    const top = r.sources.slice(0, TOP_N)
    const other = r.sources[r.sources.length - 1]
    expect(top).toHaveLength(TOP_N)
    expect(other.name).toBe('Other (4 sources)')
    expect(other.count).toBe(10) // folded DEAL count, not source count
    expect(other.foldedSources).toHaveLength(4) // folded SOURCE count
    expect(other.color).toBe(OTHER_COLOR)
    expect(other.foldedSources?.map((f) => f.name)).toEqual(['G', 'H', 'I', 'J'])
    expect(other.foldedSources?.map((f) => f.count)).toEqual([4, 3, 2, 1])
    // top-N colours are distinct and never grey
    expect(new Set(top.map((s) => s.color)).size).toBe(TOP_N)
    expect(top.every((s) => s.color !== OTHER_COLOR)).toBe(true)
  })

  it('omits the Other slice when everything fits in top-N', () => {
    const r = buildLeadSources(rows([['A', 5], ['B', 3], ['C', 2]]))
    expect(r.sources).toHaveLength(3)
    expect(r.sources.map((s) => s.name)).toEqual(['A', 'B', 'C'])
    expect(r.sources.some((s) => s.foldedSources)).toBe(false)
  })

  it('uses the 6-colour palette in order, never repeating within the top-N', () => {
    const r = buildLeadSources(
      rows(
        Array.from({ length: 9 }, (_, i) => [`S${i}`, 20 - i]),
      ),
    )
    const top = r.sources.slice(0, TOP_N)
    const colors = top.map((s) => s.color)
    expect(colors).toEqual(LEAD_SOURCE_PALETTE)
    expect(new Set(colors).size).toBe(TOP_N)
  })

  it('computes percentages off the grand total (including Other)', () => {
    // 7 sources; A-F are top-N, G folds into Other. total = 45.
    const r = buildLeadSources(
      rows([
        ['A', 30],
        ['B', 5],
        ['C', 5],
        ['D', 2],
        ['E', 1],
        ['F', 1],
        ['G', 1],
      ]),
    )
    expect(r.sources.map((s) => s.name)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'Other (1 sources)'])
    expect(r.sources.map((s) => s.percentage)).toEqual([67, 11, 11, 4, 2, 2, 2])
    expect(r.total).toBe(45)
  })

  it('percentages sum to about 100', () => {
    // integer percentages, total = 100.
    const r = buildLeadSources(
      rows([
        ['A', 30],
        ['B', 20],
        ['C', 15],
        ['D', 10],
        ['E', 10],
        ['F', 10],
        ['Other', 5],
      ]),
    )
    const sum = r.sources.reduce((acc, s) => acc + s.percentage, 0)
    expect(sum).toBe(100)
  })

  it('handles empty input', () => {
    const r = buildLeadSources([])
    expect(r.sources).toEqual([])
    expect(r.total).toBe(0)
  })
})
