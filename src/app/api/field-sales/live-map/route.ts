import { NextResponse } from 'next/server'
import { getLiveMapVisits, getActiveUsersForMap } from '@/services/field-visit.service'

export async function GET() {
  try {
    const [visits, activeUsers] = await Promise.all([getLiveMapVisits(), getActiveUsersForMap()])
    return NextResponse.json({ visits, activeUsers })
  } catch {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
}
