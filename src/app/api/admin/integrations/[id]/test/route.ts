import { NextResponse } from 'next/server'
import { testWebhookIntegration } from '@/services/integration.service'
import { requireApiSession } from '@/lib/session'
import { logger } from '@/lib/logger'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireApiSession()
    const { id } = await params
    const result = await testWebhookIntegration(id)
    return NextResponse.json(result)
  } catch (error) {
    logger.error('Error testing webhook', {}, error as Error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to test webhook' },
      { status: 500 }
    )
  }
}