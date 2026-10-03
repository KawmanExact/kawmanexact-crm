import { NextResponse } from 'next/server'
import { globalSearch } from '@/services/search.service'
import { checkRateLimit } from '@/lib/rate-limit'
import { requireApiSession } from '@/lib/session'

export async function GET(request: Request) {
  let session
  try {
    session = await requireApiSession()
  } catch {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const limit = await checkRateLimit(`global-search:${session.user.id}`, 60, 60)
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many searches. Please slow down.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
    )
  }

  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q') ?? ''

  const results = await globalSearch(q)
  return NextResponse.json(results)
}
