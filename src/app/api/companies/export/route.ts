import { NextResponse } from 'next/server'
import { requireApiSession } from '@/lib/session'
import { toCSV, csvResponse } from '@/lib/csv'
import { buildWorkbook } from '@/lib/excel-workbook'
import { getCompanies } from '@/services/company.service'

const CONTENT_TYPES = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv; charset=utf-8',
} as const

type ExportFormat = keyof typeof CONTENT_TYPES

function isExportFormat(value: string | null): value is ExportFormat {
  return value !== null && Object.prototype.hasOwnProperty.call(CONTENT_TYPES, value)
}

export async function GET(request: Request) {
  let session
  try {
    session = await requireApiSession()
  } catch {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  if (!(session.user.permissions as string[]).includes('companies.view')) {
    return new Response('Forbidden', { status: 403 })
  }

  const url = new URL(request.url)
  const requestedFormat = url.searchParams.get('format')
  if (!isExportFormat(requestedFormat)) {
    return NextResponse.json(
      { error: `format must be one of: ${Object.keys(CONTENT_TYPES).join(', ')}` },
      { status: 400 }
    )
  }

  const companies = await getCompanies()

  const meta = {
    organizationName: session.user.organization?.name ?? 'Organization',
    generatedBy: session.user.name,
    generatedAt: new Date(),
    filterLines: [],
  }

  if (requestedFormat === 'xlsx') {
    const columns = [
      { header: 'Name', key: 'name', width: 30 },
      { header: 'Industry', key: 'industry', width: 20 },
      { header: 'Website', key: 'website', width: 25 },
      { header: 'Phone', key: 'phone', width: 18 },
      { header: 'Email', key: 'email', width: 25 },
      { header: 'City', key: 'city', width: 15 },
      { header: 'State', key: 'state', width: 15 },
      { header: 'Employees', key: 'employees', width: 12, align: 'right' as const, format: '#,##0' },
      { header: 'Revenue', key: 'revenue', width: 18, align: 'right' as const, format: '#,##0.00' },
      { header: 'Owner', key: 'owner', width: 20 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Created At', key: 'createdAt', width: 16, render: (r: { createdAt?: string | Date }) => r.createdAt ? new Date(r.createdAt) : null },
    ]

    const buffer = await buildWorkbook({
      sheets: [
        {
          name: 'Companies',
          title: 'Companies',
          columns,
          rows: companies,
        },
      ],
      meta,
    })

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': CONTENT_TYPES.xlsx,
        'Content-Disposition': `attachment; filename="companies-${new Date().toISOString().slice(0, 10)}.xlsx"`,
      },
    })
  }

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