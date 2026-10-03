import { NextResponse } from 'next/server'
import { requireApiSession } from '@/lib/session'
import { toCSV, csvResponse } from '@/lib/csv'
import { getLeads } from '@/services/lead.service'

export async function GET() {
  let session
  try {
    session = await requireApiSession()
  } catch {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  if (!(session.user.permissions as string[]).includes('leads.export')) {
    return new Response('Forbidden', { status: 403 })
  }

  const leads = await getLeads()
  const csv = toCSV(leads, [
    { key: 'name', header: 'Name' },
    { key: 'company', header: 'Company' },
    { key: 'email', header: 'Email' },
    { key: 'phone', header: 'Phone' },
    { key: 'source', header: 'Source' },
    { key: 'owner', header: 'Owner' },
    { key: 'status', header: 'Status' },
    { key: 'score', header: 'Score' },
    { key: 'value', header: 'Value' },
    { key: 'lastActivityAt', header: 'Last Activity' },
    { key: 'createdAt', header: 'Created At' },
  ])

  return csvResponse(csv, `leads-${new Date().toISOString().slice(0, 10)}.csv`)
}
