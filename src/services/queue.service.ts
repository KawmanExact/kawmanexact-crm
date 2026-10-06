import 'server-only'
import { addJob, QUEUE_NAMES } from '@/lib/queue'
import type { EmailJobData, NotificationJobData, WebhookJobData, AIReportJobData, FileProcessingJobData } from '@/workers/types'

/**
 * Queue Service
 * 
 * High-level API for adding jobs to queues.
 * Provides type-safe methods for each queue type.
 */

// ============================================================
// Email Queue
// ============================================================

export async function queueEmail(data: EmailJobData): Promise<string | null> {
  return addJob(QUEUE_NAMES.EMAIL, 'send-email', data, {
    priority: 1, // High priority for transactional emails
  })
}

export async function queueBulkEmails(emails: EmailJobData[]): Promise<(string | null)[]> {
  return Promise.all(emails.map((email) => queueEmail(email)))
}

// ============================================================
// Notification Queue
// ============================================================

export async function queueNotification(data: NotificationJobData): Promise<string | null> {
  return addJob(QUEUE_NAMES.NOTIFICATION, 'create-notification', data, {
    priority: 2, // Medium priority
  })
}

export async function queueBulkNotifications(
  notifications: NotificationJobData[]
): Promise<(string | null)[]> {
  return Promise.all(notifications.map((notification) => queueNotification(notification)))
}

// ============================================================
// Webhook Queue
// ============================================================

export async function queueWebhook(data: WebhookJobData): Promise<string | null> {
  return addJob(QUEUE_NAMES.WEBHOOK, 'deliver-webhook', data, {
    priority: 3, // Lower priority (can be retried)
    attempts: 5, // More retries for webhooks
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  })
}

// ============================================================
// AI Report Queue
// ============================================================

export async function queueAIReport(data: AIReportJobData): Promise<string | null> {
  return addJob(QUEUE_NAMES.AI_REPORT, 'generate-report', data, {
    priority: 2,
    attempts: 2, // Fewer retries for expensive AI operations
  })
}

// ============================================================
// File Processing Queue
// ============================================================

export async function queueFileProcessing(data: FileProcessingJobData): Promise<string | null> {
  return addJob(QUEUE_NAMES.FILE_PROCESSING, `process-${data.operation}`, data, {
    priority: 3,
  })
}

export async function queueVirusScan(fileId: string, organizationId: string): Promise<string | null> {
  return queueFileProcessing({
    fileId,
    organizationId,
    operation: 'virus-scan',
  })
}

export async function queueOCR(fileId: string, organizationId: string): Promise<string | null> {
  return queueFileProcessing({
    fileId,
    organizationId,
    operation: 'ocr',
  })
}

export async function queueThumbnail(fileId: string, organizationId: string): Promise<string | null> {
  return queueFileProcessing({
    fileId,
    organizationId,
    operation: 'thumbnail',
  })
}

// ============================================================
// Utility Functions
// ============================================================

/**
 * Check if queues are available (Redis is connected)
 */
export function areQueuesAvailable(): boolean {
  // This will be true if Redis is configured
  return !!process.env.REDIS_URL
}

/**
 * Get queue health status
 */
export async function getQueueHealth() {
  const { getAllQueueStats } = await import('@/lib/queue')
  return getAllQueueStats()
}
