/**
 * SPANCOP sales-funnel definitions and aggregation.
 *
 * SPANCOP is the sales process Kawman tracks on the lead sheet:
 *   S Suspect → P Prospect → A Approach & Analyse → N Negotiate →
 *   C Close → O Order → P Payment
 *
 * This module owns the stage order, the letters, the copy shown in the funnel
 * legend, and the conversion maths. `Lead.funnelStage` is nullable: LOST leads
 * are tracked with `LeadStatus = LOST` and a NULL funnel stage, and are always
 * reported separately as "Lost" rather than being crammed into a stage.
 *
 * Pure module — no `server-only` — so the aggregation is unit testable and the
 * SVG client component can import the same colours and labels.
 */
import { Prisma } from '@/generated/prisma'

export const FUNNEL_STAGES = [
  'SUSPECT',
  'PROSPECT',
  'APPROACH_ANALYSE',
  'NEGOTIATE',
  'CLOSE',
  'ORDER',
  'PAYMENT',
] as const
export type FunnelStage = (typeof FUNNEL_STAGES)[number]

export interface FunnelStageMeta {
  stage: FunnelStage
  /** The single SPANCOP letter. */
  letter: string
  title: string
  definition: string
  /** Funnel band colour, top of the funnel first. */
  color: string
  textColor: string
}

export const FUNNEL_STAGE_META: Record<FunnelStage, FunnelStageMeta> = {
  SUSPECT: {
    stage: 'SUSPECT',
    letter: 'S',
    title: 'Suspect',
    definition: 'Identify potential opportunities within your target sector or campaign',
    color: '#ef4444',
    textColor: '#ffffff',
  },
  PROSPECT: {
    stage: 'PROSPECT',
    letter: 'P',
    title: 'Prospect',
    definition: 'Qualify the opportunities and establish your prospect list',
    color: '#f97316',
    textColor: '#ffffff',
  },
  APPROACH_ANALYSE: {
    stage: 'APPROACH_ANALYSE',
    letter: 'A',
    title: 'Approach & Analyse',
    definition: 'Determine the needs and establish genuine interest',
    color: '#eab308',
    textColor: '#1f2937',
  },
  NEGOTIATE: {
    stage: 'NEGOTIATE',
    letter: 'N',
    title: 'Negotiate',
    definition: 'Agree that your offer meets the needs and agree commitment to purchase',
    color: '#22c55e',
    textColor: '#ffffff',
  },
  CLOSE: {
    stage: 'CLOSE',
    letter: 'C',
    title: 'Close',
    definition: 'Close and finalise by contract or agreed terms and conditions',
    color: '#14b8a6',
    textColor: '#ffffff',
  },
  ORDER: {
    stage: 'ORDER',
    letter: 'O',
    title: 'Order',
    definition: 'Receive the order and assure delivery is made on time',
    color: '#3b82f6',
    textColor: '#ffffff',
  },
  PAYMENT: {
    stage: 'PAYMENT',
    letter: 'P',
    title: 'Payment',
    definition: 'Collect payment within agreed terms',
    color: '#a855f7',
    textColor: '#ffffff',
  },
}

export const FUNNEL_LEGEND: FunnelStageMeta[] = FUNNEL_STAGES.map((s) => FUNNEL_STAGE_META[s])

/** The SPANCOP acronym, in order. */
export const SPANCOP = FUNNEL_STAGES.map((s) => FUNNEL_STAGE_META[s].letter).join('')

/** The next stage, or undefined at Payment (the end of the funnel). */
export function nextFunnelStage(stage: FunnelStage): FunnelStage | undefined {
  const index = FUNNEL_STAGES.indexOf(stage)
  return index >= 0 && index < FUNNEL_STAGES.length - 1 ? FUNNEL_STAGES[index + 1] : undefined
}

/**
 * A funnel leads advance past any LATER stage, so counting-to-next is
 * cumulative: leads sitting at Negotiate or beyond have already converted from
 * Approach & Analyse. A stage's count is therefore the number of leads at that
 * stage or any stage after it.
 */
export function cumulativeCount(counts: Record<FunnelStage, number>, stage: FunnelStage): number {
  const index = FUNNEL_STAGES.indexOf(stage)
  let total = 0
  for (let i = index; i < FUNNEL_STAGES.length; i++) {
    total += counts[FUNNEL_STAGES[i]] ?? 0
  }
  return total
}

/**
 * Conversion percentage from `stage` to the next stage, using cumulative
 * counts. Returns 0 when the denominator is 0 rather than NaN/Infinity so the
 * UI can print "0%".
 */
export function conversionToNext(
  counts: Record<FunnelStage, number>,
  stage: FunnelStage
): number {
  const next = nextFunnelStage(stage)
  if (!next) return 0
  const from = cumulativeCount(counts, stage)
  if (from <= 0) return 0
  return round2((cumulativeCount(counts, next) / from) * 100)
}

/** Overall Suspect → Payment conversion as a percentage. */
export function overallConversion(counts: Record<FunnelStage, number>): number {
  const suspects = cumulativeCount(counts, 'SUSPECT')
  if (suspects <= 0) return 0
  return round2((cumulativeCount(counts, 'PAYMENT') / suspects) * 100)
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100
}

export interface FunnelLeadRow {
  funnelStage: FunnelStage | null
  status?: string
  value?: Prisma.Decimal | number | string | null
}

export interface FunnelStageSummary {
  stage: FunnelStage
  letter: string
  title: string
  definition: string
  color: string
  textColor: string
  /** Leads whose *current* stage is exactly this one. */
  count: number
  /** Leads at this stage or any later stage. */
  cumulative: number
  totalValue: number
  /** Conversion % to the next stage; 0 for Payment and for empty stages. */
  conversion: number
}

export interface FunnelSummary {
  stages: FunnelStageSummary[]
  lostCount: number
  lostValue: number
  /** Leads with neither a funnelStage nor status LOST (backfill gaps). */
  unstagedCount: number
  unstagedValue: number
  overallConversion: number
  totalLeads: number
}

/**
 * Sum a row's value in Decimal. Lead value is money, so it must never be
 * accumulated as a JS float — only converted once, at the render boundary.
 */
function rowValue(row: FunnelLeadRow): Prisma.Decimal {
  if (row.value === null || row.value === undefined) return new Prisma.Decimal(0)
  try {
    return new Prisma.Decimal(row.value as Prisma.Decimal)
  } catch {
    // Ignore an unparseable value rather than failing the whole funnel render.
    return new Prisma.Decimal(0)
  }
}

/** Decimal -> number, applied only where a display type requires it. */
function toDisplayNumber(value: Prisma.Decimal): number {
  return Number(value.toFixed(2))
}

/**
 * Aggregate lead rows into per-stage counts, values and conversion rates.
 * Rows with a NULL funnelStage are split by `status`: LOST leads are counted
 * as Lost; any other NULL-stage row is reported separately as unstaged so a
 * backfill gap is visible rather than silently hidden.
 */
export function aggregateFunnel(rows: FunnelLeadRow[]): FunnelSummary {
  const counts = Object.fromEntries(FUNNEL_STAGES.map((s) => [s, 0])) as Record<FunnelStage, number>
  const values = Object.fromEntries(
    FUNNEL_STAGES.map((s) => [s, new Prisma.Decimal(0)])
  ) as Record<FunnelStage, Prisma.Decimal>
  let lostValue = new Prisma.Decimal(0)
  let unstagedValue = new Prisma.Decimal(0)
  let lostCount = 0
  let unstagedCount = 0

  for (const row of rows) {
    const value = rowValue(row)
    if (row.funnelStage && counts[row.funnelStage] !== undefined) {
      counts[row.funnelStage] += 1
      values[row.funnelStage] = values[row.funnelStage].plus(value)
      continue
    }
    if (row.status === 'LOST') {
      lostCount += 1
      lostValue = lostValue.plus(value)
    } else {
      unstagedCount += 1
      unstagedValue = unstagedValue.plus(value)
    }
  }

  const stages: FunnelStageSummary[] = FUNNEL_STAGES.map((stage) => {
    const meta = FUNNEL_STAGE_META[stage]
    return {
      stage,
      letter: meta.letter,
      title: meta.title,
      definition: meta.definition,
      color: meta.color,
      textColor: meta.textColor,
      count: counts[stage],
      cumulative: cumulativeCount(counts, stage),
      totalValue: toDisplayNumber(values[stage]),
      conversion: conversionToNext(counts, stage),
    }
  })

  return {
    stages,
    lostCount,
    lostValue: toDisplayNumber(lostValue),
    overallConversion: overallConversion(counts),
    totalLeads: rows.length,
    unstagedCount,
    unstagedValue: toDisplayNumber(unstagedValue),
  }
}

/** Where a customer's open lead should move when a sale is recorded. */
export function funnelStageForPaymentState(fullyPaid: boolean): 'ORDER' | 'PAYMENT' {
  return fullyPaid ? 'PAYMENT' : 'ORDER'
}
