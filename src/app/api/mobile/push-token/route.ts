import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { mobileGuard, badRequest } from '@/lib/mobile-api'
import { logger } from '@/lib/logger'

const TOKEN_PATTERN = /^Expo(nent)?PushToken\[.+\]$/

const postSchema = z.object({
  token: z.string().regex(TOKEN_PATTERN, 'Must be a valid Expo push token'),
  platform: z.enum(['android', 'ios']),
  deviceName: z.string().trim().max(100).optional(),
})

const deleteSchema = z.object({
  token: z.string().min(1),
})

/**
 * POST /api/mobile/push-token
 * Register or refresh the current device's Expo push token.
 * The userId and organizationId always come from the session — never the body.
 */
export async function POST(request: Request) {
  const g = await mobileGuard('field_visits.view', { key: 'mobile-push-token', max: 30, windowSec: 60 })
  if ('error' in g) return g.error
  const { session } = g

  const body = await request.json().catch(() => null)
  const parsed = postSchema.safeParse(body)
  if (!parsed.success) {
    const fe: Record<string, string> = {}
    for (const i of parsed.error.issues) fe[String(i.path[0])] = i.message
    return badRequest('Invalid push token', fe)
  }
  const { token, platform, deviceName } = parsed.data

  try {
    await prisma.devicePushToken.upsert({
      where: { token },
      update: {
        userId: session.user.id,
        organizationId: session.user.organizationId,
        platform,
        deviceName: deviceName ?? null,
        lastSeenAt: new Date(),
      },
      create: {
        token,
        userId: session.user.id,
        organizationId: session.user.organizationId,
        platform,
        deviceName: deviceName ?? null,
      },
    })
  } catch (e) {
    logger.error('Failed to upsert push token', { platform }, e as Error)
    return NextResponse.json({ error: 'Could not save push token' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

/**
 * DELETE /api/mobile/push-token
 * Remove a push token. Only deletes tokens belonging to the session user.
 */
export async function DELETE(request: Request) {
  const g = await mobileGuard('field_visits.view', { key: 'mobile-push-token-del', max: 30, windowSec: 60 })
  if ('error' in g) return g.error
  const { session } = g

  const body = await request.json().catch(() => ({}))
  const parsed = deleteSchema.safeParse(body)
  if (!parsed.success) {
    return badRequest('Invalid request body', { token: 'Token is required' })
  }

  await prisma.devicePushToken.deleteMany({
    where: {
      token: parsed.data.token,
      userId: session.user.id,
      organizationId: session.user.organizationId,
    },
  })

  return NextResponse.json({ ok: true })
}
