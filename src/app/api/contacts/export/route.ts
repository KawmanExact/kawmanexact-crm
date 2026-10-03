import { NextResponse } from 'next/server'
import { requireApiSession } from '@/lib/session'
import { csvResponse } from '@/lib/csv'
import { getContacts } from '@/services/contact.service'
import { contactsToExcelCsv } from '@/lib/contacts-csv'

export async function GET() {
  let session
  try {
    session = await requireApiSession()
  } catch {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  if (!(session.user.permissions as string[]).includes('contacts.view')) {
    return new Response('Forbidden', { status: 403 })
  }

  const contacts = await getContacts()
  const csv = contactsToExcelCsv(contacts)

  return csvResponse(csv, `contacts-${new Date().toISOString().slice(0, 10)}.csv`)
}
