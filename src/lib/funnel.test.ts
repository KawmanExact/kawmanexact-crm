import { describe, it, expect } from 'vitest'
import { Prisma } from '@/generated/prisma'
import {
  FUNNEL_LEGEND,
  FUNNEL_STAGE_META,
  FUNNEL_STAGES,
  SPANCOP,
  aggregateFunnel,
  conversionToNext,
  cumulativeCount,
  funnelStageForPaymentState,
  nextFunnelStage,
  overallConversion,
  type FunnelStage,
} from './funnel'

function counts(partial: Partial<Record<FunnelStage, number>>): Record<FunnelStage, number> {
  return Object.fromEntries(FUNNEL_STAGES.map((s) => [s, partial[s] ?? 0])) as Record<
    FunnelStage,
    number
  >
}

describe('SPANCOP definitions', () => {
  it('spells SPANCOP in order', () => {
    expect(SPANCOP).toBe('SPANCOP')
    expect(FUNNEL_STAGES).toEqual([
      'SUSPECT',
      'PROSPECT',
      'APPROACH_ANALYSE',
      'NEGOTIATE',
      'CLOSE',
      'ORDER',
      'PAYMENT',
    ])
  })

  it('gives every stage a single letter, title, definition and colour', () => {
    for (const meta of FUNNEL_LEGEND) {
      expect(meta.letter).toHaveLength(1)
      expect(meta.title.length).toBeGreaterThan(0)
      expect(meta.definition.length).toBeGreaterThan(10)
      expect(meta.color).toMatch(/^#[0-9a-f]{6}$/i)
      expect(meta.textColor).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it('gives every stage a distinct band colour', () => {
    const colors = FUNNEL_LEGEND.map((m) => m.color)
    expect(new Set(colors).size).toBe(colors.length)
  })

  it('names Approach & Analyse the way the SPANCOP sheet does', () => {
    expect(FUNNEL_STAGE_META.APPROACH_ANALYSE.title).toBe('Approach & Analyse')
  })
})

describe('stage progression', () => {
  it('walks S to P', () => {
    expect(nextFunnelStage('SUSPECT')).toBe('PROSPECT')
    expect(nextFunnelStage('PROSPECT')).toBe('APPROACH_ANALYSE')
    expect(nextFunnelStage('APPROACH_ANALYSE')).toBe('NEGOTIATE')
    expect(nextFunnelStage('NEGOTIATE')).toBe('CLOSE')
    expect(nextFunnelStage('CLOSE')).toBe('ORDER')
    expect(nextFunnelStage('ORDER')).toBe('PAYMENT')
  })

  it('stops at Payment', () => {
    expect(nextFunnelStage('PAYMENT')).toBeUndefined()
  })
})

describe('cumulativeCount', () => {
  const c = counts({ SUSPECT: 10, PROSPECT: 6, APPROACH_ANALYSE: 4, NEGOTIATE: 3, CLOSE: 2, ORDER: 2, PAYMENT: 1 })

  it('counts only the leads at that exact stage for the last stage', () => {
    expect(cumulativeCount(c, 'PAYMENT')).toBe(1)
  })

  it('counts a stage plus everything after it', () => {
    expect(cumulativeCount(c, 'SUSPECT')).toBe(28)
    expect(cumulativeCount(c, 'PROSPECT')).toBe(18)
    expect(cumulativeCount(c, 'CLOSE')).toBe(5)
  })

  it('is zero for an empty funnel', () => {
    expect(cumulativeCount(counts({}), 'SUSPECT')).toBe(0)
  })
})

describe('conversion rates', () => {
  const full = counts({
    SUSPECT: 10,
    PROSPECT: 5,
    APPROACH_ANALYSE: 3,
    NEGOTIATE: 3,
    CLOSE: 2,
    ORDER: 2,
    PAYMENT: 2,
  })

  it('divides the NEXT CUMULATIVE by the CURRENT CUMULATIVE', () => {
    // Cumulative(SUSPECT) = 27, cumulative(PROSPECT) = 17 → 17/27 = 62.96%.
    // Using exact-stage counts (5/10) would hide leads that advanced past a
    // stage, so the funnel must use cumulative counts.
    expect(cumulativeCount(full, 'SUSPECT')).toBe(27)
    expect(cumulativeCount(full, 'PROSPECT')).toBe(17)
    expect(conversionToNext(full, 'SUSPECT')).toBe(62.96)
  })

  it('is 100% when every counted lead advanced past the stage', () => {
    // Nothing is still sitting at Suspect, so all 5 leads are past it.
    expect(conversionToNext(counts({ PROSPECT: 5 }), 'SUSPECT')).toBe(100)
  })

  it('is 0, never NaN, when the stage is empty', () => {
    expect(conversionToNext(counts({}), 'SUSPECT')).toBe(0)
  })

  it('is 0 at the final stage', () => {
    expect(conversionToNext(counts({ PAYMENT: 2 }), 'PAYMENT')).toBe(0)
  })

  it('overall conversion is Suspect to Payment, cumulative to cumulative', () => {
    expect(overallConversion(counts({ SUSPECT: 10, PROSPECT: 5, PAYMENT: 2 }))).toBe(11.76)
    // 2 of 12 counted leads reached Payment.
    expect(overallConversion(counts({ SUSPECT: 10, PAYMENT: 2 }))).toBe(16.67)
    expect(overallConversion(counts({}))).toBe(0)
  })
})

describe('aggregateFunnel', () => {
  it('reports a lead once, at its own stage', () => {
    const summary = aggregateFunnel([
      { funnelStage: 'SUSPECT', value: 100 },
      { funnelStage: 'PROSPECT', value: 200 },
      { funnelStage: 'PAYMENT', value: 50 },
    ])
    expect(summary.totalLeads).toBe(3)
    expect(summary.stages.find((s) => s.stage === 'SUSPECT')!.count).toBe(1)
    expect(summary.stages.find((s) => s.stage === 'PAYMENT')!.count).toBe(1)
    expect(summary.stages.find((s) => s.stage === 'CLOSE')!.count).toBe(0)
  })

  it('counts LOST leads separately from every stage', () => {
    const summary = aggregateFunnel([
      { funnelStage: 'SUSPECT', value: 100 },
      { funnelStage: null, status: 'LOST', value: 75 },
    ])
    expect(summary.lostCount).toBe(1)
    expect(summary.lostValue).toBe(75)
    expect(summary.stages.every((s) => s.count === 0 || s.stage === 'SUSPECT')).toBe(true)
  })

  it('surfaces backfill gaps as unstaged rather than hiding them', () => {
    const summary = aggregateFunnel([{ funnelStage: null, status: 'NEW', value: 30 }])
    expect(summary.unstagedCount).toBe(1)
    expect(summary.unstagedValue).toBe(30)
    expect(summary.lostCount).toBe(0)
  })

  it('returns a stage row for all seven stages even with no leads', () => {
    const summary = aggregateFunnel([])
    expect(summary.stages).toHaveLength(7)
    expect(summary.totalLeads).toBe(0)
    expect(summary.stages.every((s) => s.count === 0 && s.cumulative === 0 && s.conversion === 0)).toBe(true)
  })

  it('sums stage values in Decimal, not as floats', () => {
    const summary = aggregateFunnel([
      { funnelStage: 'SUSPECT', value: '0.1' },
      { funnelStage: 'SUSPECT', value: '0.2' },
    ])
    expect(summary.stages[0].totalValue).toBe(0.3)
  })

  it('rounds money to two decimals', () => {
    const summary = aggregateFunnel([{ funnelStage: 'ORDER', value: '1234.567' }])
    expect(summary.stages.find((s) => s.stage === 'ORDER')!.totalValue).toBe(1234.57)
  })

  it('accepts Decimal, number and string values alike', () => {
    const summary = aggregateFunnel([
      { funnelStage: 'CLOSE', value: new Prisma.Decimal('10.10') },
      { funnelStage: 'CLOSE', value: 20 },
      { funnelStage: 'CLOSE', value: '5.90' },
    ])
    expect(summary.stages.find((s) => s.stage === 'CLOSE')!.totalValue).toBe(36)
  })

  it('treats a null value as zero rather than NaN', () => {
    const summary = aggregateFunnel([{ funnelStage: 'SUSPECT', value: null }])
    expect(summary.stages[0].totalValue).toBe(0)
  })

  it('ignores an unparseable value instead of failing the whole render', () => {
    const summary = aggregateFunnel([
      { funnelStage: 'SUSPECT', value: 'not-a-number' },
      { funnelStage: 'SUSPECT', value: 10 },
    ])
    expect(summary.stages[0].count).toBe(2)
    expect(summary.stages[0].totalValue).toBe(10)
  })

  it('computes the cumulative column as stage-plus-later', () => {
    const summary = aggregateFunnel([
      { funnelStage: 'SUSPECT', value: 1 },
      { funnelStage: 'ORDER', value: 1 },
      { funnelStage: 'PAYMENT', value: 1 },
    ])
    const byStage = Object.fromEntries(summary.stages.map((s) => [s.stage, s.cumulative]))
    expect(byStage.SUSPECT).toBe(3)
    expect(byStage.ORDER).toBe(2)
    expect(byStage.PAYMENT).toBe(1)
  })
})

describe('funnelStageForPaymentState', () => {
  it('moves a fully paid sale to PAYMENT and an unpaid one to ORDER', () => {
    expect(funnelStageForPaymentState(true)).toBe('PAYMENT')
    expect(funnelStageForPaymentState(false)).toBe('ORDER')
  })
})