import 'server-only'
import type { Prisma } from '@/generated/prisma'

/**
 * Job data types for queue workers.
 * 
 * These types define the shape of job payloads that are enqueued by
 * queue.service.ts and would be consumed by workers started via the
 * worker startup functions.
 */

export interface EmailJobData {
  to: string
  subject: string
  html: string
  text?: string
  metadata?: {
    userId?: string
    organizationId?: string
    type?: string
  }
}

export interface NotificationJobData {
  organizationId: string
  userId: string
  type: Prisma.NotificationCreateInput['type']
  title: string
  message: string
  data?: Prisma.InputJsonValue
}

export interface WebhookJobData {
  url: string
  event: string
  payload: Record<string, unknown>
  secret?: string
  organizationId: string
  integrationId: string
  metadata?: Record<string, unknown>
}

export interface AIReportJobData {
  reportId: string
  organizationId: string
  userId: string
  reportType: string
  parameters: Record<string, unknown>
}

export interface FileProcessingJobData {
  fileId: string
  organizationId: string
  operation: 'virus-scan' | 'ocr' | 'thumbnail' | 'metadata'
  metadata?: Record<string, unknown>
}
