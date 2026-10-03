import { NextResponse } from 'next/server'
import { getAIUsageSummary, canViewAIAnalytics } from '@/services/ai-analytics.service'
import { requireApiSession } from '@/lib/session'

export async function GET() {
  let session
  try {
    session = await requireApiSession()
  } catch {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  if (!canViewAIAnalytics(session.user.permissions as string[] | undefined)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const result = await getAIUsageSummary()
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 500 })
    return NextResponse.json(result.data)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch AI analytics' }, { status: 500 })
  }
}
