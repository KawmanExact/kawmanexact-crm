import { NextResponse } from 'next/server'
import { mobileGuard } from '@/lib/mobile-api'
import { getDutySessions } from '@/services/field-visit.service'

export async function GET(request: Request) {
  const g = await mobileGuard('field_visits.view_all')
  if ('error' in g) return g.error

  const url = new URL(request.url)
  const date = url.searchParams.get('date')

  try {
    const sessions = await getDutySessions(date ?? undefined)
    return NextResponse.json({ sessions })
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('Permission denied')) {
      return NextResponse.json({ error: e.message }, { status: 403 })
    }
    return NextResponse.json({ error: 'Failed to load duty sessions' }, { status: 500 })
  }
}
