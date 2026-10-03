import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireApiSession } from '@/lib/session'

const STALE_MS = 8_000 // server-side throttle: ignore bursts <8s from same user

export async function POST(req: Request) {
  let session
  try {
    session = await requireApiSession()
  } catch {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const b = body as Record<string, unknown>
  const latitude = Number(b.latitude)
  const longitude = Number(b.longitude)
  const accuracy = b.accuracy != null ? Number(b.accuracy) : null
  const heading = b.heading != null && Number.isFinite(Number(b.heading)) ? Number(b.heading) : null
  const speed = b.speed != null && Number.isFinite(Number(b.speed)) ? Number(b.speed) : null

  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    return NextResponse.json({ error: 'Invalid latitude' }, { status: 400 })
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return NextResponse.json({ error: 'Invalid longitude' }, { status: 400 })
  }
  if (accuracy != null && (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 50000)) {
    return NextResponse.json({ error: 'Invalid accuracy' }, { status: 400 })
  }

  const now = new Date()

  // Server-side throttle: if last update < MIN_INTERVAL_MS ago, return ok without write (client throttles too, but this prevents abuse)
  try {
    const existing = await prisma.userLiveLocation.findUnique({ where: { userId: session.user.id }, select: { updatedAt: true } })
    if (existing && now.getTime() - new Date(existing.updatedAt).getTime() < STALE_MS) {
      // Still refresh heartbeat
      const row = await prisma.session.findFirst({ where: { userId: session.user.id }, orderBy: { updatedAt: 'desc' }, select: { id: true } })
      if (row) await prisma.session.update({ where: { id: row.id }, data: { lastSeenAt: now, updatedAt: now } }).catch(() => {})
      return NextResponse.json({ ok: true, throttled: true })
    }
  } catch {}

  try {
    await prisma.userLiveLocation.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        organizationId: session.user.organizationId,
        latitude,
        longitude,
        accuracy: accuracy != null && Number.isFinite(accuracy) ? accuracy : null,
        heading: heading != null ? heading : null,
        speed: speed != null ? speed : null,
        isTracking: true,
      },
      update: {
        latitude,
        longitude,
        accuracy: accuracy != null && Number.isFinite(accuracy) ? accuracy : null,
        heading: heading != null ? heading : null,
        speed: speed != null ? speed : null,
        isTracking: true,
        organizationId: session.user.organizationId,
      },
    })
  } catch (e) {
    console.error('[live-location POST] upsert failed', e)
    return NextResponse.json({ error: 'Failed to save location' }, { status: 500 })
  }

  // Keep Session.lastSeenAt fresh per spec
  try {
    const row = await prisma.session.findFirst({ where: { userId: session.user.id }, orderBy: { updatedAt: 'desc' }, select: { id: true } })
    if (row) await prisma.session.update({ where: { id: row.id }, data: { lastSeenAt: now, updatedAt: now } })
  } catch {}

  return NextResponse.json({ ok: true, updatedAt: now.toISOString() })
}

export async function DELETE() {
  let session
  try {
    session = await requireApiSession()
  } catch {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  try {
    await prisma.userLiveLocation.updateMany({ where: { userId: session.user.id }, data: { isTracking: false } })
  } catch {}
  return NextResponse.json({ ok: true })
}

// Optional: allow GET for debugging (org-scoped) — same as live-map but single user
export async function GET() {
  let session
  try {
    session = await requireApiSession()
  } catch {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  const loc = await prisma.userLiveLocation.findUnique({ where: { userId: session.user.id } })
  return NextResponse.json({ location: loc })
}
