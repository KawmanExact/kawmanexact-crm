import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getRedisClient } from '@/lib/redis'
import { logger } from '@/lib/logger'

type HealthStatus = 'ok' | 'degraded' | 'error'
/** Per-service state. Redis is 'disabled' when REDIS_URL is unset, which is
 *  a supported configuration (queues and rate limiting fall back in-memory),
 *  so it is distinct from an actual ping failure. */
type ServiceStatus = HealthStatus | 'disabled'

interface ServiceCheck {
  status: ServiceStatus
  latencyMs?: number
  error?: string
}

/**
 * Public health check — returns only the coarse status word. No error strings,
 * no latency, no uptime, no service breakdown: this endpoint is unauthenticated
 * and internet-reachable, and the previous shape leaked infrastructure detail
 * (raw Postgres/Redis driver messages, host names, uptime) to anyone.
 *
 * Set HEALTH_DETAIL_TOKEN to enable the detailed view, which additionally
 * requires `Authorization: Bearer <token>`. Without the token configured the
 * detailed payload is never produced at all.
 */
export async function GET(request: Request) {
  const startedAt = Date.now()

  const checks: { database: ServiceCheck; redis: ServiceCheck } = {
    database: { status: 'error' },
    redis: { status: 'disabled' },
  }

  try {
    const dbStart = Date.now()
    await prisma.$queryRaw`SELECT 1`
    checks.database = { status: 'ok', latencyMs: Date.now() - dbStart }
  } catch (e) {
    checks.database = { status: 'error', error: e instanceof Error ? e.message : 'Database query failed' }
    logger.error('Health check: database failed', { latencyMs: Date.now() - startedAt }, e as Error)
  }

  try {
    const redis = getRedisClient()
    if (redis) {
      const redisStart = Date.now()
      await redis.ping()
      checks.redis = { status: 'ok', latencyMs: Date.now() - redisStart }
    }
  } catch (e) {
    checks.redis = { status: 'error', error: e instanceof Error ? e.message : 'Redis ping failed' }
    logger.warn('Health check: redis failed', { error: checks.redis.error })
  }

  let status: HealthStatus = 'ok'
  if (checks.database.status === 'error' || checks.redis.status === 'error') {
    status = 'error'
  } else if (checks.redis.status === 'disabled') {
    status = 'degraded'
  }

  // Full detail (errors, latency, per-service breakdown) only for an
  // authorized caller; the raw messages stay in the server logs either way.
  const detailToken = process.env.HEALTH_DETAIL_TOKEN
  const authHeader = request.headers.get('authorization') ?? ''
  const wantsDetail = detailToken !== undefined && detailToken !== '' && authHeader === `Bearer ${detailToken}`

  const body = wantsDetail
    ? { status, timestamp: new Date().toISOString(), checks }
    : { status }

  logger.info('Health check completed', {
    status,
    detailed: wantsDetail,
    latencyMs: Date.now() - startedAt,
  })

  return NextResponse.json(body, {
    status: status === 'error' ? 503 : 200,
    // Never let a shared cache hold on to an auth-gated variant of this body.
    headers: { 'Cache-Control': 'no-store' },
  })
}
