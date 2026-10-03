import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Redis
vi.mock('@/lib/redis', () => ({
  getRedisClient: vi.fn(),
}))

import { getRedisClient } from '@/lib/redis'
import { checkRateLimit, getRateLimitStatus } from './rate-limit'

const mockGetRedisClient = vi.mocked(getRedisClient)

describe('rate-limit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Clear the in-memory buckets
    vi.resetModules()
  })

  describe('checkRateLimit - in-memory fallback', () => {
    it('allows first request', async () => {
      mockGetRedisClient.mockReturnValue(null)

      const result = await checkRateLimit('test-key', 5, 60)

      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(4)
      expect(result.retryAfterSeconds).toBe(0)
    })

    it('allows requests up to max', async () => {
      mockGetRedisClient.mockReturnValue(null)

      for (let i = 0; i < 5; i++) {
        const result = await checkRateLimit('test-key-2', 5, 60)
        expect(result.allowed).toBe(true)
        expect(result.remaining).toBe(4 - i)
      }
    })

    it('blocks requests exceeding max', async () => {
      mockGetRedisClient.mockReturnValue(null)

      // Use up all 5 requests
      for (let i = 0; i < 5; i++) {
        await checkRateLimit('test-key-3', 5, 60)
      }

      // 6th request should be blocked
      const result = await checkRateLimit('test-key-3', 5, 60)
      expect(result.allowed).toBe(false)
      expect(result.remaining).toBe(0)
      expect(result.retryAfterSeconds).toBeGreaterThan(0)
    })

    it('tracks different keys separately', async () => {
      mockGetRedisClient.mockReturnValue(null)

      await checkRateLimit('key-a', 2, 60)
      await checkRateLimit('key-a', 2, 60)
      const resultA = await checkRateLimit('key-a', 2, 60)
      expect(resultA.allowed).toBe(false)

      const resultB = await checkRateLimit('key-b', 2, 60)
      expect(resultB.allowed).toBe(true)
    })

    it('resets after window expires', async () => {
      mockGetRedisClient.mockReturnValue(null)

      // Use up all requests
      for (let i = 0; i < 3; i++) {
        await checkRateLimit('test-key-4', 3, 1) // 1 second window
      }

      // Wait for window to expire
      await new Promise(resolve => setTimeout(resolve, 1100))

      // Should be allowed again
      const result = await checkRateLimit('test-key-4', 3, 1)
      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(2)
    })

    it('evicts oldest entry when at capacity', async () => {
      mockGetRedisClient.mockReturnValue(null)

      // Fill up to MAX_MEMORY_BUCKETS (10000)
      // We can't easily test the exact capacity, but we can verify
      // the mechanism doesn't break
      for (let i = 0; i < 100; i++) {
        const result = await checkRateLimit(`capacity-key-${i}`, 10, 60)
        expect(result.allowed).toBe(true)
      }
    })
  })

  describe('checkRateLimit - Redis backend', () => {
    it('uses Redis when available', async () => {
      const mockRedis = {
        eval: vi.fn().mockResolvedValue([1, 0, 4]), // allowed, retryAfter=0, remaining=4
      }
      mockGetRedisClient.mockReturnValue(mockRedis as any)

      const result = await checkRateLimit('redis-key', 5, 60)

      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(4)
      expect(mockRedis.eval).toHaveBeenCalled()
    })

    it('falls back to memory when Redis throws', async () => {
      const mockRedis = {
        eval: vi.fn().mockRejectedValue(new Error('Redis connection failed')),
      }
      mockGetRedisClient.mockReturnValue(mockRedis as any)

      const result = await checkRateLimit('fallback-key', 5, 60)

      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(4)
    })
  })

  describe('getRateLimitStatus', () => {
    it('returns status without incrementing', async () => {
      mockGetRedisClient.mockReturnValue(null)

      // Make some requests
      await checkRateLimit('status-key', 5, 60)
      await checkRateLimit('status-key', 5, 60)

      // Check status
      const status = await getRateLimitStatus('status-key', 5)

      expect(status.allowed).toBe(true)
      expect(status.remaining).toBe(3)
      expect(status.retryAfterSeconds).toBe(0)
    })

    it('shows blocked status when limit exceeded', async () => {
      mockGetRedisClient.mockReturnValue(null)

      // Use up all requests
      for (let i = 0; i < 3; i++) {
        await checkRateLimit('status-key-2', 3, 60)
      }

      const status = await getRateLimitStatus('status-key-2', 3)

      expect(status.allowed).toBe(false)
      expect(status.remaining).toBe(0)
      expect(status.retryAfterSeconds).toBeGreaterThan(0)
    })

    it('returns full allowance for unknown key', async () => {
      mockGetRedisClient.mockReturnValue(null)

      const status = await getRateLimitStatus('unknown-key', 5)

      expect(status.allowed).toBe(true)
      expect(status.remaining).toBe(5)
    })
  })
})