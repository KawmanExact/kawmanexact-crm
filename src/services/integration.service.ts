import 'server-only'
import { prisma } from '@/lib/db'
import { requireApiSession } from '@/lib/session'
import { queueWebhook } from '@/services/queue.service'

export interface IntegrationItem {
  id: string
  name: string
  type: string
  isActive: boolean
  configSummary: string
  createdAt: string
}

export interface WebhookDeliveryItem {
  id: string
  event: string
  url: string
  success: boolean
  responseStatus: number | null
  error: string | null
  attempt: number
  deliveredAt: string
}

const CONFIG_TYPES = [
  { type: 'webhook', label: 'Webhook', description: 'Send events to an external URL on lead/deal/meeting changes.' },
  { type: 'slack', label: 'Slack', description: 'Post notifications to a Slack channel via an incoming webhook.' },
  { type: 'calendar', label: 'Calendar sync', description: 'Sync meetings and field visits to an external calendar feed.' },
  { type: 'email', label: 'Email forwarding', description: 'Forward specific notification types to an external inbox.' },
] as const

export function getIntegrationTypes() {
  return CONFIG_TYPES
}

/** Summarizes config for display without dumping the full (potentially sensitive) JSON blob into the list view. */
function summarize(config: unknown): string {
  if (config && typeof config === 'object') {
    const obj = config as Record<string, unknown>
    if (typeof obj.url === 'string') return obj.url
    if (typeof obj.channel === 'string') return `#${obj.channel}`
    if (typeof obj.email === 'string') return obj.email
  }
  return 'Configured'
}

export async function getIntegrations(): Promise<IntegrationItem[]> {
  const session = await requireApiSession()
  const rows = await prisma.integration.findMany({
    where: { organizationId: session.user.organizationId },
    orderBy: { createdAt: 'desc' },
  })
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    isActive: r.isActive,
    configSummary: summarize(r.config),
    createdAt: r.createdAt.toISOString(),
  }))
}

/**
 * Get webhook delivery history for an integration
 */
export async function getWebhookDeliveries(
  integrationId: string,
  limit = 50,
  offset = 0
): Promise<{ deliveries: WebhookDeliveryItem[]; total: number; hasMore: boolean }> {
  const session = await requireApiSession()

  // Verify integration belongs to organization
  const integration = await prisma.integration.findFirst({
    where: {
      id: integrationId,
      organizationId: session.user.organizationId,
    },
  })

  if (!integration) {
    throw new Error('Integration not found')
  }

  const [deliveries, total] = await Promise.all([
    prisma.webhookDelivery.findMany({
      where: { integrationId },
      orderBy: { deliveredAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.webhookDelivery.count({ where: { integrationId } }),
  ])

  return {
    deliveries: deliveries.map((d) => ({
      id: d.id,
      event: d.event,
      url: d.url,
      success: d.success,
      responseStatus: d.responseStatus,
      error: d.error,
      attempt: d.attempt,
      deliveredAt: d.deliveredAt.toISOString(),
    })),
    total,
    hasMore: offset + deliveries.length < total,
  }
}

/**
 * Test a webhook integration by sending a test payload
 */
export async function testWebhookIntegration(integrationId: string): Promise<{ success: boolean; message: string }> {
  const session = await requireApiSession()

  const integration = await prisma.integration.findFirst({
    where: {
      id: integrationId,
      organizationId: session.user.organizationId,
      type: 'webhook',
    },
  })

  if (!integration) {
    throw new Error('Webhook integration not found')
  }

  const config = integration.config as Record<string, unknown>
  const url = config.url as string
  const secret = config.secret as string | undefined

  if (!url) {
    throw new Error('Webhook URL not configured')
  }

  // Queue a test webhook
  const jobId = await queueWebhook({
    url,
    event: 'test',
    payload: {
      message: 'This is a test webhook from Kawman ExAct',
      timestamp: new Date().toISOString(),
      integrationName: integration.name,
    },
    secret,
    organizationId: session.user.organizationId,
    integrationId: integration.id,
  })

  if (!jobId) {
    return { success: false, message: 'Failed to queue test webhook (Redis not available)' }
  }

  return { success: true, message: 'Test webhook queued successfully' }
}

/**
 * Retry a failed webhook delivery
 */
export async function retryWebhookDelivery(deliveryId: string): Promise<{ success: boolean; message: string }> {
  const session = await requireApiSession()

  const delivery = await prisma.webhookDelivery.findFirst({
    where: {
      id: deliveryId,
      integration: {
        organizationId: session.user.organizationId,
      },
    },
    include: {
      integration: true,
    },
  })

  if (!delivery) {
    throw new Error('Webhook delivery not found')
  }

  if (delivery.success) {
    return { success: false, message: 'Delivery was already successful' }
  }

  const config = delivery.integration.config as Record<string, unknown>
  const secret = config.secret as string | undefined

  // Queue a retry
  const jobId = await queueWebhook({
    url: delivery.url,
    event: delivery.event,
    payload: delivery.payload as Record<string, unknown>,
    secret,
    organizationId: session.user.organizationId,
    integrationId: delivery.integrationId,
  })

  if (!jobId) {
    return { success: false, message: 'Failed to queue retry (Redis not available)' }
  }

  return { success: true, message: 'Retry queued successfully' }
}
