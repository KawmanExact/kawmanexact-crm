/**
 * Normalisation + bucketing for the "Leads by Source" dashboard card.
 *
 * `Deal.source` is free text, so the same channel is often entered many
 * different ways ("Referral  ", "referral", "REFER"). This module folds
 * those variants into one group, keeps the most common spelling as the
 * display name, and buckets everything beyond the top-N into a single grey
 * "Other" slice.
 */

export interface LeadSourceRow {
  source: string | null
  count: number
}

export interface LeadSource {
  id: string
  name: string
  count: number
  percentage: number
  color: string
  /** Populated only on the folded "Other" slice, for a hover tooltip. */
  foldedSources?: Array<{ name: string; count: number }>
}

export interface LeadSourcesData {
  sources: LeadSource[]
  total: number
}

const LEAD_SOURCE_PALETTE = ['#818cf8', '#38bdf8', '#34d399', '#fb923c', '#f472b6', '#facc15']
const OTHER_COLOR = '#6b7280'
const TOP_N = 6

/** Trim + collapse internal whitespace. Returns '' for blank / nullish input. */
export function normalizeSource(raw: string | null | undefined): string {
  if (raw == null) return ''
  return String(raw).trim().replace(/\s+/g, ' ')
}

export { LEAD_SOURCE_PALETTE, OTHER_COLOR, TOP_N }

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Bucket lead-source rows into top-N + a single grey "Other" slice.
 *
 *  - Grouping is case-insensitive on the normalised source text.
 *  - The most common original spelling wins as the display name.
 *  - Blank / null sources become "Unknown".
 *  - Percentages are rounded off the grand total.
 *  - Exactly TOP_N colours are used, never cycling onto "Other".
 */
export function buildLeadSources(rows: LeadSourceRow[]): LeadSourcesData {
  const total = rows.reduce((sum, r) => sum + (r.count > 0 ? r.count : 0), 0)

  const byKey = new Map<string, { originals: Map<string, number>; count: number }>()
  const order: string[] = []

  for (const row of rows) {
    const normalized = normalizeSource(row.source)
    const key = normalized.toLowerCase()
    const original = normalized === '' ? 'Unknown' : normalized
    if (!byKey.has(key)) {
      byKey.set(key, { originals: new Map(), count: 0 })
      order.push(key)
    }
    const g = byKey.get(key)!
    const add = row.count > 0 ? row.count : 0
    g.count += add
    g.originals.set(original, (g.originals.get(original) ?? 0) + add)
  }

  const groups = order.map((key) => {
    const g = byKey.get(key)!
    let best = ''
    let bestCount = -1
    for (const [orig, c] of g.originals.entries()) {
      if (c > bestCount) {
        bestCount = c
        best = orig
      }
    }
    return { name: best, count: g.count, originals: g.originals }
  })

  groups.sort((a, b) => b.count - a.count)

  const sources: LeadSource[] = []
  const overflow: typeof groups = []

  groups.forEach((g, i) => {
    if (i < TOP_N) {
      sources.push({
        id: slugify(g.name),
        name: g.name,
        count: g.count,
        percentage: total > 0 ? Math.round((g.count / total) * 100) : 0,
        color: LEAD_SOURCE_PALETTE[i % LEAD_SOURCE_PALETTE.length],
      })
    } else {
      overflow.push(g)
    }
  })

  if (overflow.length > 0) {
    const otherCount = overflow.reduce((s, g) => s + g.count, 0)
    sources.push({
      id: 'other',
      name: `Other (${overflow.length} sources)`,
      count: otherCount,
      percentage: total > 0 ? Math.round((otherCount / total) * 100) : 0,
      color: OTHER_COLOR,
      foldedSources: overflow
        .map((g) => ({ name: g.name, count: g.count }))
        .sort((a, b) => b.count - a.count),
    })
  }

  return { sources, total }
}
