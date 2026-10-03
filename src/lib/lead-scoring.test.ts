import { describe, it, expect } from 'vitest'
import { calculateLeadScore } from './lead-scoring'

const baseInput = {
  status: 'NEW',
  source: null,
  hasEmail: false,
  hasPhone: false,
  hasCompanyRecord: false,
  dealValue: null,
  activityCount: 0,
  lastActivityAt: null,
  completedFollowUps: 0,
  overdueFollowUps: 0,
  now: new Date('2026-01-15T00:00:00Z'),
}

describe('calculateLeadScore', () => {
  it('gives a bare-minimum lead a low score with no positive factors', () => {
    const result = calculateLeadScore(baseInput)
    expect(result.score).toBeLessThan(20)
  })

  it('never returns a score outside 0-100 regardless of how many positive signals stack up', () => {
    const result = calculateLeadScore({
      ...baseInput,
      status: 'NEGOTIATION',
      source: 'referral',
      hasEmail: true,
      hasPhone: true,
      hasCompanyRecord: true,
      dealValue: 50_000_000,
      activityCount: 50,
      lastActivityAt: new Date('2026-01-14T00:00:00Z'),
      completedFollowUps: 20,
    })
    expect(result.score).toBeLessThanOrEqual(100)
    expect(result.score).toBeGreaterThanOrEqual(0)
  })

  it('never returns a negative score even when every penalty applies', () => {
    const result = calculateLeadScore({
      ...baseInput,
      lastActivityAt: new Date('2025-11-01T00:00:00Z'), // 75+ days stale
      overdueFollowUps: 10,
    })
    expect(result.score).toBeGreaterThanOrEqual(0)
  })

  it('rewards recent activity more than stale activity, all else equal', () => {
    const recent = calculateLeadScore({ ...baseInput, lastActivityAt: new Date('2026-01-14T00:00:00Z') })
    const stale = calculateLeadScore({ ...baseInput, lastActivityAt: new Date('2025-11-01T00:00:00Z') })
    expect(recent.score).toBeGreaterThan(stale.score)
  })

  it('weighs a high-quality source (referral) above a low-quality one (cold call)', () => {
    const referral = calculateLeadScore({ ...baseInput, source: 'referral' })
    const coldCall = calculateLeadScore({ ...baseInput, source: 'cold call' })
    expect(referral.score).toBeGreaterThan(coldCall.score)
  })

  it('falls back to a moderate default weight for an unrecognized source string', () => {
    const known = calculateLeadScore({ ...baseInput, source: 'cold call' })
    const unknown = calculateLeadScore({ ...baseInput, source: 'some-new-channel' })
    // Unknown sources shouldn't be penalized as harshly as a known-low-quality one.
    expect(unknown.score).toBeGreaterThanOrEqual(known.score)
  })

  it('penalizes overdue follow-ups', () => {
    // Use a baseline with some positive score first — baseInput alone
    // already floors at 0, leaving no room to demonstrate a penalty.
    const withEngagement = { ...baseInput, hasEmail: true, activityCount: 2 }
    const clean = calculateLeadScore(withEngagement)
    const overdue = calculateLeadScore({ ...withEngagement, overdueFollowUps: 3 })
    expect(overdue.score).toBeLessThan(clean.score)
  })

  it('rewards completed follow-ups', () => {
    const none = calculateLeadScore(baseInput)
    const completed = calculateLeadScore({ ...baseInput, completedFollowUps: 3 })
    expect(completed.score).toBeGreaterThan(none.score)
  })

  it('gives more credit for further sales-process progression', () => {
    const contacted = calculateLeadScore({ ...baseInput, status: 'CONTACTED' })
    const qualified = calculateLeadScore({ ...baseInput, status: 'QUALIFIED' })
    const negotiation = calculateLeadScore({ ...baseInput, status: 'NEGOTIATION' })
    expect(qualified.score).toBeGreaterThan(contacted.score)
    expect(negotiation.score).toBeGreaterThan(qualified.score)
  })

  it('returns a factor breakdown that sums to the same score (before clamping)', () => {
    const result = calculateLeadScore({
      ...baseInput,
      hasEmail: true,
      hasPhone: true,
      activityCount: 2,
    })
    const sum = result.factors.reduce((total, f) => total + f.points, 0)
    expect(sum).toBe(result.score)
  })

  it('does not include zero-point factors in the breakdown', () => {
    const result = calculateLeadScore(baseInput)
    expect(result.factors.every((f) => f.points !== 0)).toBe(true)
  })
})
