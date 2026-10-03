import { NextResponse } from 'next/server'
import { getAIUsageAggregate, canViewAIAnalytics } from '@/services/ai-analytics.service'
import { requireApiSession } from '@/lib/session'

export async function GET(request: Request) {
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
    const { searchParams } = new URL(request.url)
    const filters = {
      userId: searchParams.get('userId') || undefined,
      model: searchParams.get('model') || undefined,
      provider: searchParams.get('provider') || undefined,
      feature: searchParams.get('feature') || undefined,
      dateFrom: searchParams.get('dateFrom') ? new Date(searchParams.get('dateFrom')!) : undefined,
      dateTo: searchParams.get('dateTo') ? new Date(searchParams.get('dateTo')!) : undefined,
    }

    const result = await getAIUsageAggregate(filters)
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 500 })
    return NextResponse.json(result.data)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch AI analytics' }, { status: 500 })
  }
}
