import 'server-only'
import { prisma } from '@/lib/db'
import { requireApiSession } from '@/lib/session'
import type { Prisma } from '@/generated/prisma'
import { ok, err, Result } from '@/lib/result'

/**
 * AI analytics exposes per-person token counts and cost, so it is admin-only.
 * Any ONE of these permissions is sufficient — 'ai.analytics.view' is the
 * dedicated grant, the other two are the pre-existing admin capabilities that
 * already imply full visibility into the workspace. Deliberately NOT
 * 'ai.use': every role up to and including VIEWER holds that, which is what
 * made the dashboard readable by any employee before this guard existed.
 */
export const AI_ANALYTICS_PERMISSIONS = ['ai.analytics.view', 'settings.manage', 'audit_logs.view'] as const

export function canViewAIAnalytics(permissions: readonly string[] | undefined | null): boolean {
  if (!permissions) return false
  return AI_ANALYTICS_PERMISSIONS.some((p) => permissions.includes(p))
}

export interface AIUsageRecord {
  id: string
  organizationId: string
  userId: string
  model: string
  provider: string
  inputTokens: number
  outputTokens: number
  estimatedCost: number
  feature: string
  createdAt: Date
}

export interface AIUsageAggregate {
  totalRequests: number
  totalInputTokens: number
  totalOutputTokens: number
  totalCost: number
  byModel: Record<string, { requests: number; inputTokens: number; outputTokens: number; cost: number }>
  byFeature: Record<string, { requests: number; inputTokens: number; outputTokens: number; cost: number }>
  byUser: Record<string, { requests: number; inputTokens: number; outputTokens: number; cost: number; name: string }>
  daily: Array<{ date: string; requests: number; inputTokens: number; outputTokens: number; cost: number }>
}

/**
 * Note there is deliberately NO `organizationId` field here. The org scope is
 * always taken from the session inside each function below, so making it
 * impossible to pass an org id is stronger than ignoring one that was passed.
 * The query params that reach these functions are userId/model/provider/
 * feature/date/limit/offset only.
 */
export interface AIUsageFilters {
  userId?: string
  model?: string
  provider?: string
  feature?: string
  dateFrom?: Date
  dateTo?: Date
  limit?: number
  offset?: number
}

const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 2.50, output: 10.00 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'gpt-4-turbo': { input: 10.00, output: 30.00 },
  'o1-preview': { input: 15.00, output: 60.00 },
  'gemini-2.0-flash': { input: 0.075, output: 0.30 },
  'gemini-1.5-pro': { input: 1.25, output: 5.00 },
  'gemini-1.5-flash': { input: 0.075, output: 0.30 },
}

function estimateCost(model: string, provider: string, inputTokens: number, outputTokens: number): number {
  const key = model.toLowerCase()
  const costs = MODEL_COSTS[key] || { input: 1.0, output: 3.0 }
  return (inputTokens / 1_000_000) * costs.input + (outputTokens / 1_000_000) * costs.output
}

/**
 * Persists a single AI usage event to the database, computing the estimated
 * cost from per-model token pricing. Called after every AI completion.
 */
export async function recordAIUsage(params: {
  organizationId: string
  userId: string
  model: string
  provider: string
  inputTokens: number
  outputTokens: number
  feature: string
}): Promise<Result<AIUsageRecord>> {
  try {
    const estimatedCost = estimateCost(params.model, params.provider, params.inputTokens, params.outputTokens)

    const record = await prisma.aIUsage.create({
      data: {
        organizationId: params.organizationId,
        userId: params.userId,
        model: params.model,
        provider: params.provider,
        inputTokens: params.inputTokens,
        outputTokens: params.outputTokens,
        estimatedCost,
        feature: params.feature,
      },
    })

    return ok(record)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to record AI usage'
    return err(msg)
  }
}

/**
 * Single enforcement point for every AI-analytics read. Enforced here (not
 * only in the route/page) so the service is safe to call from anywhere —
 * a route handler, a server component, or a future internal caller.
 * Throws when unauthenticated or lacking an admin-level permission.
 */
async function requireAIAnalyticsSession() {
  const session = await requireApiSession()
  if (!canViewAIAnalytics(session.user.permissions as string[] | undefined)) {
    throw new Error('Permission denied: ai.analytics.view')
  }
  return session
}

/**
 * Fetches paginated AI usage records for the session's organization,
 * scoped by optional filters (userId, model, provider, feature, date range).
 */
export async function getAIUsage(filters: AIUsageFilters = {}): Promise<Result<{ data: AIUsageRecord[]; total: number }>> {
  try {
    const session = await requireAIAnalyticsSession()
    // The org always comes from the session. `filters.organizationId` is
    // accepted for call-site compatibility but deliberately ignored, so no
    // caller can widen the query into another organization.
    const orgId = session.user.organizationId

    const where: Prisma.AIUsageWhereInput = {
      organizationId: orgId,
      ...(filters.userId && { userId: filters.userId }),
      ...(filters.model && { model: filters.model }),
      ...(filters.provider && { provider: filters.provider }),
      ...(filters.feature && { feature: filters.feature }),
      ...(filters.dateFrom || filters.dateTo
        ? {
            createdAt: {
              ...(filters.dateFrom && { gte: filters.dateFrom }),
              ...(filters.dateTo && { lte: filters.dateTo }),
            },
          }
        : {}),
    }

    const [data, total] = await Promise.all([
      prisma.aIUsage.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: filters.limit || 100,
        skip: filters.offset || 0,
      }),
      prisma.aIUsage.count({ where }),
    ])

    return ok({ data, total })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to fetch AI usage'
    return err(msg)
  }
}

/**
 * Computes aggregate AI usage metrics (totals, breakdown by model/feature/user,
 * and daily trends) for the session's organization within optional filters.
 */
export async function getAIUsageAggregate(filters: AIUsageFilters = {}): Promise<Result<AIUsageAggregate>> {
  try {
    const session = await requireAIAnalyticsSession()
    const orgId = session.user.organizationId

    const where: Prisma.AIUsageWhereInput = {
      organizationId: orgId,
      ...(filters.userId && { userId: filters.userId }),
      ...(filters.model && { model: filters.model }),
      ...(filters.provider && { provider: filters.provider }),
      ...(filters.feature && { feature: filters.feature }),
      ...(filters.dateFrom || filters.dateTo
        ? {
            createdAt: {
              ...(filters.dateFrom && { gte: filters.dateFrom }),
              ...(filters.dateTo && { lte: filters.dateTo }),
            },
          }
        : {}),
    }

    const records = await prisma.aIUsage.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 10000,
    })

    const aggregate: AIUsageAggregate = {
      totalRequests: records.length,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCost: 0,
      byModel: {},
      byFeature: {},
      byUser: {},
      daily: [],
    }

    const dailyMap = new Map<string, { requests: number; inputTokens: number; outputTokens: number; cost: number }>()

    for (const r of records) {
      aggregate.totalInputTokens += r.inputTokens
      aggregate.totalOutputTokens += r.outputTokens
      aggregate.totalCost += r.estimatedCost

      if (!aggregate.byModel[r.model]) {
        aggregate.byModel[r.model] = { requests: 0, inputTokens: 0, outputTokens: 0, cost: 0 }
      }
      aggregate.byModel[r.model].requests++
      aggregate.byModel[r.model].inputTokens += r.inputTokens
      aggregate.byModel[r.model].outputTokens += r.outputTokens
      aggregate.byModel[r.model].cost += r.estimatedCost

      if (!aggregate.byFeature[r.feature]) {
        aggregate.byFeature[r.feature] = { requests: 0, inputTokens: 0, outputTokens: 0, cost: 0 }
      }
      aggregate.byFeature[r.feature].requests++
      aggregate.byFeature[r.feature].inputTokens += r.inputTokens
      aggregate.byFeature[r.feature].outputTokens += r.outputTokens
      aggregate.byFeature[r.feature].cost += r.estimatedCost

      if (!aggregate.byUser[r.userId]) {
        aggregate.byUser[r.userId] = { requests: 0, inputTokens: 0, outputTokens: 0, cost: 0, name: '' }
      }
      aggregate.byUser[r.userId].requests++
      aggregate.byUser[r.userId].inputTokens += r.inputTokens
      aggregate.byUser[r.userId].outputTokens += r.outputTokens
      aggregate.byUser[r.userId].cost += r.estimatedCost

      const dateKey = r.createdAt.toISOString().split('T')[0]
      if (!dailyMap.has(dateKey)) {
        dailyMap.set(dateKey, { requests: 0, inputTokens: 0, outputTokens: 0, cost: 0 })
      }
      const day = dailyMap.get(dateKey)!
      day.requests++
      day.inputTokens += r.inputTokens
      day.outputTokens += r.outputTokens
      day.cost += r.estimatedCost
    }

    const userIds = Object.keys(aggregate.byUser)
    if (userIds.length > 0) {
      const users = await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true },
      })
      for (const u of users) {
        if (aggregate.byUser[u.id]) {
          aggregate.byUser[u.id].name = u.name || u.email
        }
      }
    }

    aggregate.daily = Array.from(dailyMap.entries())
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date))

    return ok(aggregate)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to aggregate AI usage'
    return err(msg)
  }
}

/**
 * Computes a high-level AI usage summary for the session's organization:
 * today / this-week / this-month totals (requests + cost), plus the top 10
 * models and top 10 users by request count.
 */
export async function getAIUsageSummary(): Promise<Result<{
  today: { requests: number; cost: number }
  thisWeek: { requests: number; cost: number }
  thisMonth: { requests: number; cost: number }
  topModels: Array<{ model: string; requests: number; cost: number }>
  topUsers: Array<{ userId: string; name: string; requests: number; cost: number }>
}>> {
  try {
    const session = await requireAIAnalyticsSession()
    const orgId = session.user.organizationId

    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const weekStart = new Date(todayStart)
    weekStart.setDate(weekStart.getDate() - weekStart.getDay())
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    const orgWhere = { organizationId: orgId }

    const [todayAgg, weekAgg, monthAgg, topModelsRaw, topUsersRaw] = await Promise.all([
      prisma.aIUsage.aggregate({
        where: { ...orgWhere, createdAt: { gte: todayStart } },
        _count: { _all: true },
        _sum: { estimatedCost: true },
      }),
      prisma.aIUsage.aggregate({
        where: { ...orgWhere, createdAt: { gte: weekStart } },
        _count: { _all: true },
        _sum: { estimatedCost: true },
      }),
      prisma.aIUsage.aggregate({
        where: { ...orgWhere, createdAt: { gte: monthStart } },
        _count: { _all: true },
        _sum: { estimatedCost: true },
      }),
      prisma.aIUsage.groupBy({
        by: ['model'],
        where: orgWhere,
        _count: { _all: true },
        _sum: { estimatedCost: true },
      }),
      prisma.aIUsage.groupBy({
        by: ['userId'],
        where: orgWhere,
        _count: { _all: true },
        _sum: { estimatedCost: true },
      }),
    ])

    const topModels = topModelsRaw
      .map((m) => ({ model: m.model, requests: m._count._all, cost: Number(m._sum.estimatedCost ?? 0) }))
      .sort((a, b) => b.requests - a.requests)
      .slice(0, 10)

    const topUsers = topUsersRaw
      .map((u) => ({ userId: u.userId, requests: u._count._all, cost: Number(u._sum.estimatedCost ?? 0) }))
      .sort((a, b) => b.requests - a.requests)
      .slice(0, 10)

    const topUserIds = topUsers.map((u) => u.userId)
    const users = topUserIds.length
      ? await prisma.user.findMany({
          where: { id: { in: topUserIds } },
          select: { id: true, name: true, email: true },
        })
      : []
    const userNameMap = new Map(users.map((u) => [u.id, u.name || u.email]))

    return ok({
      today: { requests: todayAgg._count._all, cost: Number(todayAgg._sum.estimatedCost ?? 0) },
      thisWeek: { requests: weekAgg._count._all, cost: Number(weekAgg._sum.estimatedCost ?? 0) },
      thisMonth: { requests: monthAgg._count._all, cost: Number(monthAgg._sum.estimatedCost ?? 0) },
      topModels,
      topUsers: topUsers.map((u) => ({
        userId: u.userId,
        name: userNameMap.get(u.userId) || u.userId,
        requests: u.requests,
        cost: u.cost,
      })),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to get AI usage summary'
    return err(msg)
  }
}