import 'server-only'
import { NextResponse } from 'next/server'
import { requireApiSession } from '@/lib/session'
import { getUserPermissions } from '@/services/permission.service'
import { checkRateLimit } from '@/lib/rate-limit'

type Session = Awaited<ReturnType<typeof requireApiSession>>

/**
 * Shared guard for /api/mobile/* routes. Works with the bearer token sent by
 * the Android app (or a normal cookie). Does a LIVE permission lookup because
 * session.user.permissions can be up to 60s stale (cookieCache).
 */
export async function mobileGuard(
  permission?: string,
  rate?: { key: string; max: number; windowSec: number },
): Promise<{ session: Session } | { error: NextResponse }> {
  let session: Session
  try {
    session = await requireApiSession()
  } catch {
    return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) }
  }
  if (permission) {
    const live = await getUserPermissions(session.user.id, session.user.organizationId)
    if (!live.includes(permission)) {
      return { error: NextResponse.json({ error: 'You do not have permission to do this.' }, { status: 403 }) }
    }
  }
  if (rate) {
    const limit = await checkRateLimit(`${rate.key}:${session.user.id}`, rate.max, rate.windowSec)
    if (!limit.allowed) {
      return {
        error: NextResponse.json(
          { error: 'Too many requests. Please slow down.' },
          { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
        ),
      }
    }
  }
  return { session }
}

export function badRequest(error: string, fieldErrors?: Record<string, string>) {
  return NextResponse.json({ error, fieldErrors }, { status: 400 })
}

/** Only accept photo URLs that were uploaded to OUR Cloudinary account + org folder. */
export function isTrustedCloudinaryImage(url: string, organizationId: string): boolean {
  const cloud = process.env.CLOUDINARY_CLOUD_NAME
  if (!cloud) return false
  const prefix = `https://res.cloudinary.com/${cloud}/image/upload/`
  return url.startsWith(prefix) && url.includes(`/kawman-exact/${organizationId}/`)
}
