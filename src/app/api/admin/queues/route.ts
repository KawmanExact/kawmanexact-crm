import { NextResponse } from 'next/server'
import { requireApiSession } from '@/lib/session'
import { getAllQueueStats } from '@/lib/queue'
import { areQueuesAvailable } from '@/services/queue.service'
import { logger } from '@/lib/logger'

/**
 * GET /api/admin/queues
 * 
 * Returns statistics for all BullMQ queues.
 * Admin-only endpoint for monitoring background job processing.
 */
export async function GET() {
  try {
    const session = await requireApiSession()

    const roles = session.user.roles as string[] | undefined
    if (!roles?.some((r) => r === 'SUPER_ADMIN' || r === 'ADMIN')) {
      return NextResponse.json(
        { error: 'Forbidden: requires SUPER_ADMIN or ADMIN role' },
        { status: 403 }
      )
    }

    if (!areQueuesAvailable()) {
      return NextResponse.json(
        {
          available: false,
          message: 'Queues are not available. Redis is not configured.',
          queues: [],
        },
        { status: 503 }
      )
    }

    const stats = await getAllQueueStats()

    return NextResponse.json({
      available: true,
      queues: stats,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    logger.error('Error fetching queue stats', {}, error as Error)
    return NextResponse.json(
      { error: 'Failed to fetch queue statistics' },
      { status: 500 }
    )
  }
}
