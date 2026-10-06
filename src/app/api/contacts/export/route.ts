/**
 * GET /api/contacts/export?format=xlsx|csv
 */
import { NextResponse } from 'next/server'
import { requireApiSession } from '@/lib/session'
import { csvResponse } from '@/lib/csv'
import { buildWorkbook } from '@/lib/excel-workbook'
import { getContacts } from '@/services/contact.service'
import { contactsToExcelCsv } from '@/lib/contacts-csv'

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
  if (!(session.user.permissions as string[]).includes('contacts.view')) {
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

  const contacts = await getContacts()

  const meta = {
    organizationName: session.user.organization?.name ?? 'Organization',
    generatedBy: session.user.name,
    generatedAt: new Date(),
    filterLines: [],
  }

  if (requestedFormat === 'xlsx') {
    const columns = [
      { header: 'First Name', key: 'firstName', width: 15 },
      { header: 'Last Name', key: 'lastName', width: 15 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Phone', key: 'phone', width: 18 },
      { header: 'Company', key: 'companyName', width: 25 },
      { header: 'Title', key: 'title', width: 20 },
      { header: 'Department', key: 'department', width: 18 },
      { header: 'City', key: 'city', width: 15 },
      { header: 'State', key: 'state', width: 15 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Created At', key: 'createdAt', width: 16, render: (r: { createdAt?: string | Date }) => r.createdAt ? new Date(r.createdAt) : null },
    ]

    const buffer = await buildWorkbook({
      sheets: [
        {
          name: 'Contacts',
          title: 'Contacts',
          columns,
          rows: contacts as { createdAt?: string | Date }[],
        },
      ],
      meta,
    })

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': CONTENT_TYPES.xlsx,
        'Content-Disposition': `attachment; filename="contacts-${new Date().toISOString().slice(0, 10)}.xlsx"`,
      },
    })
  }

  const csv = contactsToExcelCsv(contacts)
  return csvResponse(csv, `contacts-${new Date().toISOString().slice(0, 10)}.csv`)
}