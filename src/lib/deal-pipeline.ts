import type { DealStage } from '@/types/crm'

export interface DealPipelineStage {
  id: 'SUSPECT' | 'PROSPECT' | 'APPROACH_ANALYSE' | 'NEGOTIATE' | 'CLOSE' | 'ORDER' | 'PAYMENT' | 'LOST'
  label: string
  description: string
  color: string
  probability: number
  isFunnel: boolean
}

export const DEAL_PIPELINE_STAGES: DealPipelineStage[] = [
  {
    id: 'SUSPECT',
    label: 'SUSPECT',
    description: 'Identify potential opportunities within the target sector or company.',
    color: '#ef4444',
    probability: 10,
    isFunnel: true,
  },
  {
    id: 'PROSPECT',
    label: 'PROSPECT',
    description: 'Qualify the opportunity and establish genuine sales potential.',
    color: '#f97316',
    probability: 25,
    isFunnel: true,
  },
  {
    id: 'APPROACH_ANALYSE',
    label: 'APPROACH & ANALYSE',
    description: 'Understand customer requirements, application, quantity, pricing expectations and interest.',
    color: '#eab308',
    probability: 40,
    isFunnel: true,
  },
  {
    id: 'NEGOTIATE',
    label: 'NEGOTIATE',
    description: 'Discuss pricing, specifications, commercial terms and delivery conditions.',
    color: '#22c55e',
    probability: 60,
    isFunnel: true,
  },
  {
    id: 'CLOSE',
    label: 'CLOSE',
    description: 'Finalize the deal and agree on commercial terms.',
    color: '#3b82f6',
    probability: 75,
    isFunnel: true,
  },
  {
    id: 'ORDER',
    label: 'ORDER',
    description: 'Receive the purchase order and confirm order and delivery details.',
    color: '#1e40af',
    probability: 90,
    isFunnel: true,
  },
  {
    id: 'PAYMENT',
    label: 'PAYMENT',
    description: 'Track payment against the agreed payment terms.',
    color: '#8b5cf6',
    probability: 100,
    isFunnel: true,
  },
  {
    id: 'LOST',
    label: 'LOST',
    description: 'Opportunity was lost or discontinued.',
    color: '#6b7280',
    probability: 0,
    isFunnel: false,
  },
]

export const DEAL_STAGES = DEAL_PIPELINE_STAGES as readonly DealPipelineStage[]

export const STAGE_LABELS: Record<string, string> = {
  SUSPECT: 'SUSPECT',
  PROSPECT: 'PROSPECT',
  APPROACH_ANALYSE: 'APPROACH & ANALYSE',
  NEGOTIATE: 'NEGOTIATE',
  CLOSE: 'CLOSE',
  ORDER: 'ORDER',
  PAYMENT: 'PAYMENT',
  LOST: 'LOST',
}

export const STAGE_COLORS: Record<string, string> = {
  SUSPECT: '#ef4444',
  PROSPECT: '#f97316',
  APPROACH_ANALYSE: '#eab308',
  NEGOTIATE: '#22c55e',
  CLOSE: '#3b82f6',
  ORDER: '#1e40af',
  PAYMENT: '#8b5cf6',
  LOST: '#6b7280',
}

export const STAGE_PROBABILITIES: Record<string, number> = {
  SUSPECT: 10,
  PROSPECT: 25,
  APPROACH_ANALYSE: 40,
  NEGOTIATE: 60,
  CLOSE: 75,
  ORDER: 90,
  PAYMENT: 100,
  LOST: 0,
}

export const LOST_REASONS = [
  'Price too high',
  'Customer not interested',
  'Competitor selected',
  'Product requirement changed',
  'No response',
  'Budget unavailable',
  'Other',
] as const

export function getStageLabel(stage: string): string {
  return STAGE_LABELS[stage] ?? stage
}

export function getStageColor(stage: string): string {
  return STAGE_COLORS[stage] ?? '#94a3b8'
}

export function getStageProbability(stage: string): number {
  return STAGE_PROBABILITIES[stage] ?? 0
}

export function getFunnelStages(): DealPipelineStage[] {
  return DEAL_PIPELINE_STAGES.filter((s) => s.isFunnel)
}

export function getStageIndex(stage: string): number {
  return DEAL_PIPELINE_STAGES.findIndex((s) => s.id === stage)
}

export function canMoveToStage(from: string, to: string): boolean {
  if (to === 'LOST') return true
  const fromIdx = getStageIndex(from)
  const toIdx = getStageIndex(to)
  if (fromIdx === -1 || toIdx === -1) return true
  return true
}

export function stageToUrl(stage: string): string {
  return stage.toLowerCase().replace(/_/g, '-')
}

export function mapOldStageToNew(oldStage: string): DealStage {
  const mapping: Record<string, DealStage> = {
    NEW_LEAD: 'SUSPECT',
    CONTACTED: 'PROSPECT',
    QUALIFIED: 'APPROACH_ANALYSE',
    PROPOSAL: 'NEGOTIATE',
    NEGOTIATION: 'CLOSE',
    WON: 'PAYMENT',
    LOST: 'LOST',
  }
  return mapping[oldStage] ?? 'SUSPECT'
}
