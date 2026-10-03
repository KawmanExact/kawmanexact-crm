import { describe, it, expect, afterAll } from 'vitest'
import { getQueue, addJob, getQueueStats, closeQueues, QUEUE_NAMES } from './queue'
import { queueEmail, queueNotification } from '@/services/queue.service'

/**
 * Queue Infrastructure Tests
 * 
 * Note: These tests require a running Redis instance.
 * Set REDIS_URL in your test environment or skip these tests.
 */

const REDIS_AVAILABLE = !!process.env.REDIS_URL

describe.skipIf(!REDIS_AVAILABLE)('Queue Infrastructure', () => {
  afterAll(async () => {
    await closeQueues()
  })

  describe('Queue Creation', () => {
    it('should create a queue instance', () => {
      const queue = getQueue(QUEUE_NAMES.EMAIL)
      expect(queue).toBeDefined()
      expect(queue?.name).toBe(QUEUE_NAMES.EMAIL)
    })

    it('should return the same queue instance on subsequent calls', () => {
      const queue1 = getQueue(QUEUE_NAMES.EMAIL)
      const queue2 = getQueue(QUEUE_NAMES.EMAIL)
      expect(queue1).toBe(queue2)
    })

    it('should create different queues for different names', () => {
      const emailQueue = getQueue(QUEUE_NAMES.EMAIL)
      const webhookQueue = getQueue(QUEUE_NAMES.WEBHOOK)
      expect(emailQueue).not.toBe(webhookQueue)
    })
  })

  describe('Job Addition', () => {
    it('should add a job to the queue', async () => {
      const jobId = await addJob(QUEUE_NAMES.EMAIL, 'test-job', {
        to: 'test@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
      })

      expect(jobId).toBeDefined()
      expect(typeof jobId).toBe('string')
    })

    it('should add a job with custom options', async () => {
      const jobId = await addJob(
        QUEUE_NAMES.EMAIL,
        'test-job-with-options',
        { to: 'test@example.com', subject: 'Test', html: '<p>Test</p>' },
        { priority: 1, delay: 1000 }
      )

      expect(jobId).toBeDefined()
    })
  })

  describe('Queue Statistics', () => {
    it('should get queue statistics', async () => {
      const stats = await getQueueStats(QUEUE_NAMES.EMAIL)

      expect(stats).toBeDefined()
      expect(stats?.name).toBe(QUEUE_NAMES.EMAIL)
      expect(typeof stats?.waiting).toBe('number')
      expect(typeof stats?.active).toBe('number')
      expect(typeof stats?.completed).toBe('number')
      expect(typeof stats?.failed).toBe('number')
    })
  })

  describe('Queue Service Helpers', () => {
    it('should queue an email', async () => {
      const jobId = await queueEmail({
        to: 'test@example.com',
        subject: 'Test Email',
        html: '<p>Test</p>',
      })

      expect(jobId).toBeDefined()
    })

    it('should queue a notification', async () => {
      const jobId = await queueNotification({
        organizationId: 'test-org',
        userId: 'test-user',
        type: 'NEW_LEAD',
        title: 'Test Notification',
        message: 'This is a test',
      })

      expect(jobId).toBeDefined()
    })
  })
})

describe('Queue Infrastructure (No Redis)', () => {
  it('should return null when Redis is not available', () => {
    // Temporarily unset REDIS_URL
    const originalUrl = process.env.REDIS_URL
    delete process.env.REDIS_URL

    const queue = getQueue(QUEUE_NAMES.EMAIL)
    expect(queue).toBeNull()

    // Restore
    if (originalUrl) process.env.REDIS_URL = originalUrl
  })
})
