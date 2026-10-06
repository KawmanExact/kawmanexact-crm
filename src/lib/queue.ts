import 'server-only'
import { Queue, Worker, QueueEvents, JobsOptions } from 'bullmq'
import { getRedisClient } from './redis'

/**
 * BullMQ Queue Infrastructure
 * 
 * Provides background job processing for:
 * - Email notifications
 * - Webhook deliveries
 * - AI report generation
 * - File processing (virus scan, OCR)
 * - In-app notifications
 * 
 * All queues share the same Redis connection.
 */

// Queue names
export const QUEUE_NAMES = {
  EMAIL: 'email',
  WEBHOOK: 'webhook',
  AI_REPORT: 'ai-report',
  FILE_PROCESSING: 'file-processing',
  NOTIFICATION: 'notification',
} as const

export type QueueName = typeof QUEUE_NAMES[keyof typeof QUEUE_NAMES]

// Default job options
const defaultJobOptions: JobsOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 1000,
  },
  removeOnComplete: {
    age: 24 * 3600, // Keep completed jobs for 24 hours
    count: 1000,    // Keep max 1000 completed jobs
  },
  removeOnFail: {
    age: 7 * 24 * 3600, // Keep failed jobs for 7 days
  },
}

// Queue instances cache
const queues = new Map<QueueName, Queue>()
const workers = new Map<QueueName, Worker>()
const queueEvents = new Map<QueueName, QueueEvents>()

/**
 * Get or create a queue instance
 */
export function getQueue(name: QueueName): Queue | null {
  const redis = getRedisClient()
  if (!redis) {
    console.warn(`[QUEUE] Redis not available, queue "${name}" disabled`)
    return null
  }

  if (!queues.has(name)) {
    const queue = new Queue(name, {
      connection: redis,
      defaultJobOptions: defaultJobOptions,
    })
    queues.set(name, queue)
  }

  return queues.get(name)!
}

/**
 * Get queue events for monitoring
 */
export function getQueueEvents(name: QueueName): QueueEvents | null {
  const redis = getRedisClient()
  if (!redis) return null

  if (!queueEvents.has(name)) {
    const events = new QueueEvents(name, { connection: redis })
    queueEvents.set(name, events)
  }

  return queueEvents.get(name)!
}

/**
 * Add a job to a queue
 */
export async function addJob<T = unknown>(
  queueName: QueueName,
  jobName: string,
  data: T,
  options?: JobsOptions
): Promise<string | null> {
  const queue = getQueue(queueName)
  if (!queue) {
    console.warn(`[QUEUE] Cannot add job "${jobName}" - queue "${queueName}" not available`)
    return null
  }

  try {
    const job = await queue.add(jobName, data, options)
    console.log(`[QUEUE] Added job "${jobName}" to "${queueName}" (id: ${job.id})`)
    return job.id ?? null
  } catch (error) {
    console.error(`[QUEUE] Failed to add job "${jobName}" to "${queueName}":`, error)
    return null
  }
}

/**
 * Create a worker for processing jobs
 */
export function createWorker<T = unknown>(
  queueName: QueueName,
  processor: (job: { name: string; data: T; id?: string; attemptsMade: number }) => Promise<void>,
  options?: { concurrency?: number }
): Worker | null {
  const redis = getRedisClient()
  if (!redis) {
    console.warn(`[QUEUE] Cannot create worker for "${queueName}" - Redis not available`)
    return null
  }

  if (workers.has(queueName)) {
    console.warn(`[QUEUE] Worker for "${queueName}" already exists`)
    return workers.get(queueName)!
  }

  const worker = new Worker(
    queueName,
    async (job) => {
      console.log(`[WORKER:${queueName}] Processing job "${job.name}" (id: ${job.id})`)
      try {
        await processor({ name: job.name, data: job.data as T, id: job.id, attemptsMade: job.attemptsMade })
        console.log(`[WORKER:${queueName}] Completed job "${job.name}" (id: ${job.id})`)
      } catch (error) {
        console.error(`[WORKER:${queueName}] Failed job "${job.name}" (id: ${job.id}):`, error)
        throw error
      }
    },
    {
      connection: redis,
      concurrency: options?.concurrency ?? 5,
    }
  )

  worker.on('error', (error) => {
    console.error(`[WORKER:${queueName}] Error:`, error)
  })

  worker.on('failed', (job, error) => {
    console.error(`[WORKER:${queueName}] Job ${job?.id} failed:`, error)
  })

  workers.set(queueName, worker)
  return worker
}

/**
 * Close all queues and workers gracefully
 */
export async function closeQueues(): Promise<void> {
  console.log('[QUEUE] Closing all queues and workers...')

  // Close workers first
  for (const [name, worker] of workers) {
    try {
      await worker.close()
      console.log(`[QUEUE] Closed worker "${name}"`)
    } catch (error) {
      console.error(`[QUEUE] Error closing worker "${name}":`, error)
    }
  }
  workers.clear()

  // Close queue events
  for (const [name, events] of queueEvents) {
    try {
      await events.close()
      console.log(`[QUEUE] Closed events "${name}"`)
    } catch (error) {
      console.error(`[QUEUE] Error closing events "${name}":`, error)
    }
  }
  queueEvents.clear()

  // Close queues
  for (const [name, queue] of queues) {
    try {
      await queue.close()
      console.log(`[QUEUE] Closed queue "${name}"`)
    } catch (error) {
      console.error(`[QUEUE] Error closing queue "${name}":`, error)
    }
  }
  queues.clear()

  console.log('[QUEUE] All queues and workers closed')
}

/**
 * Get queue statistics
 */
export async function getQueueStats(name: QueueName) {
  const queue = getQueue(name)
  if (!queue) return null

  const [waiting, active, completed, failed, delayed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
  ])

  return {
    name,
    waiting,
    active,
    completed,
    failed,
    delayed,
    total: waiting + active + completed + failed + delayed,
  }
}

/**
 * Get all queue statistics
 */
export async function getAllQueueStats() {
  const stats = await Promise.all(
    Object.values(QUEUE_NAMES).map((name) => getQueueStats(name))
  )
  return stats.filter(Boolean)
}
