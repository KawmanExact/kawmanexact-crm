/**
 * Automatic lead scoring (audit: "Lead Scoring — score field stored, no
 * automatic scoring algorithm, no score history"). Pure function over a
 * snapshot of signals already in the DB — no new schema fields needed.
 * Kept separate from the DB-querying half (in lead.service.ts) so the
 * scoring logic itself is easy to read, test, and tune independent of
 * how the inputs get fetched.
 *
 * Deliberately has NO `import 'server-only'` marker, unlike most files
 * in this codebase — this module does no I/O (no Prisma, no env
 * secrets, nothing sensitive), so there's nothing for that marker to
 * protect. That also means it can be unit-tested directly in plain
 * Node/Vitest without needing Next.js's server-bundler runtime — see
 * lead-scoring.test.ts.
 */

export interface LeadScoreInput {
  status: string
  source: string | null
  hasEmail: boolean
  hasPhone: boolean
  hasCompanyRecord: boolean
  dealValue: number | null
  activityCount: number
  lastActivityAt: Date | null
  completedFollowUps: number
  overdueFollowUps: number
  now?: Date
}

export interface LeadScoreFactor {
  label: string
  points: number
}

export interface LeadScoreResult {
  score: number
  factors: LeadScoreFactor[]
}

const SOURCE_WEIGHTS: Record<string, number> = {
  referral: 15,
  partner: 15,
  website: 10,
  inbound: 10,
  event: 8,
  'trade show': 8,
  'cold call': 2,
  'cold email': 2,
  outbound: 2,
}

const STATUS_PROGRESS_WEIGHTS: Record<string, number> = {
  NEW: 0,
  CONTACTED: 5,
  QUALIFIED: 15,
  PROPOSAL: 25,
  NEGOTIATION: 30,
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

function daysSince(date: Date, now: Date): number {
  return (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
}

/**
 * Scores 0-100. WON/LOST leads aren't rescored (their status is terminal
 * and re-running this shouldn't move a closed lead's number around), but
 * the function still runs for them for consistency — callers can choose
 * to skip persisting for closed leads.
 */
export function calculateLeadScore(input: LeadScoreInput): LeadScoreResult {
  const now = input.now ?? new Date()
  const factors: LeadScoreFactor[] = []

  const add = (label: string, points: number) => {
    if (points !== 0) factors.push({ label, points })
  }

  // Demographics / firmographics — is there enough to actually reach and
  // qualify this lead?
  if (input.hasEmail) add('Has email on file', 15)
  if (input.hasPhone) add('Has phone on file', 10)
  if (input.hasCompanyRecord) add('Linked to a company record', 15)

  if (input.dealValue && input.dealValue > 0) {
    const valuePoints = clamp(Math.round((input.dealValue / 500000) * 20), 1, 20)
    add(`Estimated value ₹${input.dealValue.toLocaleString('en-IN')}`, valuePoints)
  }

  const sourceKey = input.source?.trim().toLowerCase()
  const sourcePoints = sourceKey ? (SOURCE_WEIGHTS[sourceKey] ?? 5) : 0
  if (input.source) add(`Source: ${input.source}`, sourcePoints)

  // Engagement — how much has actually happened with this lead.
  const engagementPoints = clamp(input.activityCount * 5, 0, 20)
  if (input.activityCount > 0) {
    add(`${input.activityCount} logged activit${input.activityCount === 1 ? 'y' : 'ies'}`, engagementPoints)
  }

  if (input.lastActivityAt) {
    const days = daysSince(input.lastActivityAt, now)
    if (days <= 3) add('Active in the last 3 days', 15)
    else if (days <= 7) add('Active in the last week', 10)
    else if (days <= 14) add('Active in the last 2 weeks', 5)
    else if (days > 30) add('No activity in 30+ days', -10)
  } else {
    add('No activity logged yet', -5)
  }

  if (input.completedFollowUps > 0) {
    add(`${input.completedFollowUps} completed follow-up${input.completedFollowUps === 1 ? '' : 's'}`, clamp(input.completedFollowUps * 5, 0, 10))
  }
  if (input.overdueFollowUps > 0) {
    add(`${input.overdueFollowUps} overdue follow-up${input.overdueFollowUps === 1 ? '' : 's'}`, clamp(input.overdueFollowUps * -5, -15, 0))
  }

  // Status progression — further down a real sales process = warmer lead.
  const statusPoints = STATUS_PROGRESS_WEIGHTS[input.status] ?? 0
  if (statusPoints > 0) add(`Status: ${input.status.replace('_', ' ')}`, statusPoints)

  const rawScore = factors.reduce((sum, f) => sum + f.points, 0)
  const score = clamp(Math.round(rawScore), 0, 100)

  return { score, factors }
}
