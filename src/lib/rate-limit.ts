import 'server-only'
import { getRedisClient } from '@/lib/redis'
import { logger } from '@/lib/logger'

/**
 * Sliding-window rate limiter with Redis backend (shared across instances)
 * Falls back to in-memory Map when Redis is not configured.
 * 
 * Used for API routes not covered by Better-Auth's built-in limiter:
 * - AI chat/reports/data-analysis
 * - File upload
 * - Other expensive operations
 */

interface Bucket {
  count: number
  resetAt: number
}

// In-memory fallback (single instance only) — bounded to prevent DoS via key flooding
const MAX_MEMORY_BUCKETS = 10000
const memoryBuckets = new Map<string, Bucket>()
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000
let lastCleanup = Date.now()

function cleanupMemoryIfDue() {
  const now = Date.now()
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return
  lastCleanup = now
  for (const [key, bucket] of memoryBuckets) {
    if (bucket.resetAt <= now) memoryBuckets.delete(key)
  }
}

export interface RateLimitResult {
  allowed: boolean
  /** Seconds until the caller can retry, only meaningful when !allowed. */
  retryAfterSeconds: number
  remaining: number
}

/**
 * Check rate limit for a given key.
 * @param key Unique identifier, e.g. `ai-chat:${userId}` or `file-upload:${userId}`
 * @param max Maximum requests allowed within the window
 * @param windowSeconds Length of the sliding window in seconds
 */
export async function checkRateLimit(key: string, max: number, windowSeconds: number): Promise<RateLimitResult> {
  const redis = getRedisClient()
  const now = Date.now()
  const windowMs = windowSeconds * 1000
  const resetAt = now + windowMs

  if (redis) {
    // Redis-backed rate limiting (shared across instances)
    try {
      const luaScript = `
        local key = KEYS[1]
        local max = tonumber(ARGV[1])
        local window = tonumber(ARGV[2])
        local now = tonumber(ARGV[3])
        local resetAt = now + window
        
        local current = redis.call('GET', key)
        if current then
          local data = cjson.decode(current)
          if data.resetAt > now then
            if data.count >= max then
              return {0, math.ceil((data.resetAt - now) / 1000), 0}
            end
            data.count = data.count + 1
            redis.call('SET', key, cjson.encode(data), 'PX', window)
            return {1, 0, max - data.count}
          end
        end
        
        local newData = {count = 1, resetAt = resetAt}
        redis.call('SET', key, cjson.encode(newData), 'PX', window)
        return {1, 0, max - 1}
      `
      
      const result = await redis.eval(luaScript, 1, key, max, windowMs, now) as [number, number, number]
      return {
        allowed: result[0] === 1,
        retryAfterSeconds: result[1],
        remaining: result[2],
      }
    } catch (error) {
      logger.error('Redis error, falling back to memory', {}, error as Error)
      // Fall through to memory fallback
    }
  }

  // In-memory fallback (single instance)
  cleanupMemoryIfDue()
  // Evict oldest entry if at capacity
  if (!memoryBuckets.has(key) && memoryBuckets.size >= MAX_MEMORY_BUCKETS) {
    const firstKey = memoryBuckets.keys().next().value
    if (firstKey) memoryBuckets.delete(firstKey)
  }
  const existing = memoryBuckets.get(key)

  if (!existing || existing.resetAt <= now) {
    memoryBuckets.set(key, { count: 1, resetAt })
    return { allowed: true, retryAfterSeconds: 0, remaining: max - 1 }
  }

  if (existing.count >= max) {
    return { allowed: false, retryAfterSeconds: Math.ceil((existing.resetAt - now) / 1000), remaining: 0 }
  }

  existing.count += 1
  return { allowed: true, retryAfterSeconds: 0, remaining: max - existing.count }
}

/**
 * Get current rate limit status without incrementing.
 * Useful for displaying remaining quota to users.
 */
export async function getRateLimitStatus(key: string, max: number): Promise<RateLimitResult> {
  const redis = getRedisClient()
  const now = Date.now()

  if (redis) {
    try {
      const data = await redis.get(key)
      if (data) {
        const parsed = JSON.parse(data)
        if (parsed.resetAt > now) {
          return {
            allowed: parsed.count < max,
            retryAfterSeconds: parsed.count >= max ? Math.ceil((parsed.resetAt - now) / 1000) : 0,
            remaining: Math.max(0, max - parsed.count),
          }
        }
      }
      return { allowed: true, retryAfterSeconds: 0, remaining: max }
    } catch (error) {
      logger.error('Redis error getting status', {}, error as Error)
    }
  }

  // Memory fallback
  cleanupMemoryIfDue()
  const existing = memoryBuckets.get(key)
  if (!existing || existing.resetAt <= now) {
    return { allowed: true, retryAfterSeconds: 0, remaining: max }
  }
  return {
    allowed: existing.count < max,
    retryAfterSeconds: existing.count >= max ? Math.ceil((existing.resetAt - now) / 1000) : 0,
    remaining: Math.max(0, max - existing.count),
  }
}
