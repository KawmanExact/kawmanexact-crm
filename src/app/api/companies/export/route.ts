import { NextResponse } from 'next/server'
import { requireApiSession } from '@/lib/session'
import { toCSV, csvResponse } from '@/lib/csv'
import { getCompanies } from '@/services/company.service'

export async function GET() {
  let session
  try {
    session = await requireApiSession()
  } catch {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  if (!(session.user.permissions as string[]).includes('companies.view')) {
    return new Response('Forbidden', { status: 403 })
  }

  const companies = await getCompanies()
  const csv = toCSV(companies, [
    { key: 'name', header: 'Name' },
    { key: 'industry', header: 'Industry' },
    { key: 'website', header: 'Website' },
    { key: 'phone', header: 'Phone' },
    { key: 'email', header: 'Email' },
    { key: 'city', header: 'City' },
    { key: 'state', header: 'State' },
    { key: 'employees', header: 'Employees' },
    { key: 'revenue', header: 'Revenue' },
    { key: 'owner', header: 'Owner' },
    { key: 'status', header: 'Status' },
    { key: 'createdAt', header: 'Created At' },
  ])

  return csvResponse(csv, `companies-${new Date().toISOString().slice(0, 10)}.csv`)
}
