import { NextRequest, NextResponse } from 'next/server'
import { retryWebhookDelivery } from '@/services/integration.service'
import { requireApiSession } from '@/lib/session'
import { logger } from '@/lib/logger'

export async function POST(
  request: NextRequest
) {
  try {
    await requireApiSession()
    const body = await request.json()
    const { deliveryId } = body

    if (!deliveryId) {
      return NextResponse.json(
        { error: 'deliveryId is required' },
        { status: 400 }
      )
    }

    const result = await retryWebhookDelivery(deliveryId)
    return NextResponse.json(result)
  } catch (error) {
    logger.error('Error retrying webhook', {}, error as Error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to retry webhook' },
      { status: 500 }
    )
  }
}