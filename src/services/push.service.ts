import 'server-only'
import { prisma } from '@/lib/db'
import { logger } from '@/lib/logger'

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'
const BATCH_SIZE = 100

export interface PushPayload {
  title: string
  body: string
  data?: Record<string, unknown>
  sound?: string
  channelId?: string
  priority?: 'default' | 'high' | 'normal'
  ttl?: number
}

interface ExpoPushMessage {
  to: string
  title: string
  body: string
  data?: Record<string, unknown>
  sound: string
  channelId: string
  priority: string
  ttl: number
}

interface ExpoPushReceiptError {
  status: 'error'
  message: string
  details?: { error?: string }
}

interface ExpoPushReceiptSuccess {
  status: 'ok'
  id: string
}

type ExpoReceipt = ExpoPushReceiptSuccess | ExpoPushReceiptError

/**
 * Load all active push tokens for a user in an organization.
 */
async function getUserTokens(userId: string, organizationId: string): Promise<{ token: string; platform: string; id: string }[]> {
  return prisma.devicePushToken.findMany({
    where: { userId, organizationId },
    select: { token: true, platform: true, id: true },
  })
}

/**
 * Send a push notification to all of a user's registered devices.
 *
 * Fire-and-forget: never throws to the caller. Logs failures internally.
 * Tokens that return DeviceNotRegistered are deleted.
 */
export async function sendPushToUser(
  userId: string,
  organizationId: string,
  payload: PushPayload,
): Promise<void> {
  try {
    const tokens = await getUserTokens(userId, organizationId)
    if (tokens.length === 0) return

    const messages: ExpoPushMessage[] = tokens.map((t) => ({
      to: t.token,
      title: payload.title,
      body: payload.body,
      data: payload.data,
      sound: payload.sound ?? 'visit_alert.wav',
      channelId: payload.channelId ?? 'visit-assignments-v1',
      priority: payload.priority ?? 'high',
      ttl: payload.ttl ?? 3600,
    }))

    // Expo allows batching up to 100 messages per request
    for (let i = 0; i < messages.length; i += BATCH_SIZE) {
      const batch = messages.slice(i, i + BATCH_SIZE)
      await sendPushBatch(batch, tokens.slice(i, i + BATCH_SIZE).map((t) => ({ token: t.token, id: t.id })))
    }
  } catch (e) {
    logger.error('sendPushToUser failed', { userId, organizationId }, e as Error)
  }
}

interface TokenRef {
  token: string
  id: string
}

async function sendPushBatch(messages: ExpoPushMessage[], refs: TokenRef[]): Promise<void> {
  const accessToken = process.env.EXPO_ACCESS_TOKEN

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`
  }

  let response: Response
  try {
    response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({ pushMessage: messages }),
    })
  } catch (e) {
    logger.error('Expo push request failed', {}, e as Error)
    return
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    logger.error('Expo push API error', { status: response.status, body }, new Error('Non-200 response from Expo push API'))
    return
  }

  const json = await response.json().catch(() => null) as { data?: ExpoReceipt[] } | null
  if (!json?.data) return

  // Process per-token receipts
  for (let i = 0; i < json.data.length && i < refs.length; i++) {
    const receipt = json.data[i]
    if (receipt.status === 'error' && receipt.details?.error === 'DeviceNotRegistered') {
      const ref = refs[i]
      try {
        await prisma.devicePushToken.delete({ where: { token: ref.token, id: ref.id } })
      } catch {
        // ignore — token may have already been deleted
      }
    }
  }
}
