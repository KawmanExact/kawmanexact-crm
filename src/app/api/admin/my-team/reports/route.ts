import { NextRequest, NextResponse } from 'next/server'
import { getTeamDailyReports } from '@/services/daily-report.service'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const userId = searchParams.get('userId')
    const status = searchParams.get('status')
    const search = searchParams.get('search')
    const page = Math.min(100, Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1))
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '20', 10) || 20))

    const result = await getTeamDailyReports({
      from: from || undefined,
      to: to || undefined,
      userId: userId || undefined,
      status: status || undefined,
      search: search || undefined,
      page,
      pageSize,
    })

    if (!result.success) {
      const msg = result.error
      const status = msg.startsWith('Forbidden') ? 403 : msg === 'Not authenticated' ? 401 : 500
      return NextResponse.json({ error: msg }, { status })
    }

    return NextResponse.json(result.data)
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to fetch reports'
    const status = msg.startsWith('Forbidden') ? 403 : msg === 'Not authenticated' ? 401 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
