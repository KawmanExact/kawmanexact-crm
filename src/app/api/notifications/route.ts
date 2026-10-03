import { NextRequest, NextResponse } from 'next/server'
import { requireApiSession } from '@/lib/session'
import { getUserNotifications, markNotificationsRead, deleteNotification, deleteAllNotifications } from '@/services/notification.service'
import { logger } from '@/lib/logger'

/**
 * GET /api/notifications
 * Get user notifications with pagination
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireApiSession()
    const { searchParams } = new URL(request.url)

    const limit = parseInt(searchParams.get('limit') || '20')
    const offset = parseInt(searchParams.get('offset') || '0')
    const unreadOnly = searchParams.get('unreadOnly') === 'true'

    const result = await getUserNotifications({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      limit,
      offset,
      unreadOnly,
    })

    return NextResponse.json(result)
  } catch (error) {
    logger.error('Error fetching notifications', {}, error as Error)
    return NextResponse.json(
      { error: 'Failed to fetch notifications' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/notifications
 * Mark notifications as read
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = await requireApiSession()
    const body = await request.json()

    const { notificationIds, markAll } = body

    const result = await markNotificationsRead({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      notificationIds,
      markAll,
    })

    return NextResponse.json(result)
  } catch (error) {
    logger.error('Error marking notifications as read', {}, error as Error)
    return NextResponse.json(
      { error: 'Failed to mark notifications as read' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/notifications
 * Delete a notification
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await requireApiSession()
    const body = await request.json().catch(() => ({}))
    const notificationId = body?.id

    if (notificationId) {
      await deleteNotification(notificationId, session.user.id, session.user.organizationId)
    } else {
      await deleteAllNotifications(session.user.id, session.user.organizationId)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error('Error deleting notification', {}, error as Error)
    return NextResponse.json(
      { error: 'Failed to delete notification' },
      { status: 500 }
    )
  }
}
