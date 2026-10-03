import 'server-only'
import Redis from 'ioredis'
import { logger } from '@/lib/logger'

/**
 * Redis client for shared state across server instances.
 * Used for rate limiting, caching, and other distributed state.
 * 
 * Connection is lazy - only created when first accessed.
 */
let redisClient: Redis | null = null

export function getRedisClient(): Redis | null {
  if (redisClient) return redisClient

  const redisUrl = process.env.REDIS_URL
  if (!redisUrl) {
    return null
  }

  try {
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (times > 3) return null // Stop retrying
        return Math.min(times * 200, 2000)
      },
    })

    redisClient.on('error', (err) => {
      logger.error('Redis connection error', {}, err)
    })

    redisClient.on('connect', () => {
      if (process.env.NODE_ENV === 'development') console.log('[REDIS] Connected successfully')
    })

    return redisClient
  } catch (error) {
    logger.error('Failed to create Redis client', {}, error as Error)
    return null
  }
}

export async function closeRedisClient(): Promise<void> {
  if (redisClient) {
    await redisClient.quit()
    redisClient = null
  }
}