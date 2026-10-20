import { NextResponse } from 'next/server'
import { mobileGuard } from '@/lib/mobile-api'
import { startDutySession } from '@/services/field-visit.service'

export async function POST() {
  const g = await mobileGuard('field_visits.create')
  if ('error' in g) return g.error

  try {
    const result = await startDutySession()
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }
    return NextResponse.json({ ok: true, sessionId: result.data })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to start duty session' }, { status: 500 })
  }
}
