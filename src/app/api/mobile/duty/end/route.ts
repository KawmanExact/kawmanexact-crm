import { NextResponse } from 'next/server'
import { mobileGuard } from '@/lib/mobile-api'
import { endDutySession } from '@/services/field-visit.service'

export async function POST() {
  const g = await mobileGuard('field_visits.update')
  if ('error' in g) return g.error

  try {
    const result = await endDutySession()
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }
    return NextResponse.json({ ok: true, ended: result.data })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to end duty session' }, { status: 500 })
  }
}
