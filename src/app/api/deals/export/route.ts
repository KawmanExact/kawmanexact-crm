import { NextResponse } from 'next/server'
import { requireApiSession } from '@/lib/session'
import { toCSV, csvResponse } from '@/lib/csv'
import { getDeals } from '@/services/deal.service'

export async function GET() {
  let session
  try {
    session = await requireApiSession()
  } catch {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  if (!(session.user.permissions as string[]).includes('deals.export')) {
    return new Response('Forbidden', { status: 403 })
  }

  const deals = await getDeals()
  const csv = toCSV(deals, [
    { key: 'name', header: 'Name' },
    { key: 'company', header: 'Company' },
    { key: 'contact', header: 'Contact' },
    { key: 'value', header: 'Value' },
    { key: 'probability', header: 'Probability' },
    { key: 'stage', header: 'Stage' },
    { key: 'owner', header: 'Owner' },
    { key: 'priority', header: 'Priority' },
    { key: 'expectedClose', header: 'Expected Close' },
  ])

  return csvResponse(csv, `deals-${new Date().toISOString().slice(0, 10)}.csv`)
}
