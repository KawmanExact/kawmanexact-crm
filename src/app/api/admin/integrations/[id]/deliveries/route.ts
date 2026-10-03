import { NextRequest, NextResponse } from 'next/server'
import { getWebhookDeliveries } from '@/services/integration.service'
import { requireApiSession } from '@/lib/session'
import { logger } from '@/lib/logger'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireApiSession()
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    const result = await getWebhookDeliveries(id, limit, offset)
    return NextResponse.json(result)
  } catch (error) {
    logger.error('Error fetching webhook deliveries', {}, error as Error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch deliveries' },
      { status: 500 }
    )
  }
}