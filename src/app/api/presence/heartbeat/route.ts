import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireApiSession } from '@/lib/session'

export async function POST() {
  let session
  try {
    session = await requireApiSession()
  } catch {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const now = new Date()
  // Touch the most recent active session for this user (better-auth may have multiple rows)
  const row = await prisma.session.findFirst({
    where: { userId: session.user.id },
    orderBy: { updatedAt: 'desc' },
    select: { id: true },
  })
  if (row) {
    await prisma.session.update({ where: { id: row.id }, data: { lastSeenAt: now, updatedAt: now } })
  }
  return NextResponse.json({ ok: true, lastSeenAt: now.toISOString() })
}
