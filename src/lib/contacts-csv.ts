/**
 * Contacts CSV export — single source of truth for the columns, display
 * values, country-code rules and Excel text-quoting used by every Contacts
 * CSV export path (API route, report engine, and the inline "Export selected").
 *
 * Deliberately has NO `server-only` marker: the inline table export runs in
 * the browser, so this module imports only the client-safe `toCSV`/`csv.ts`
 * helpers (which are themselves marker-free) and a plain type from `@/types/crm`.
 */
import type { Contact } from '@/types/crm'
import { toCSV, CSV_BOM, type CsvColumn } from '@/lib/csv'
import { withCountryCode } from '@/lib/phone'

export { withCountryCode, DEFAULT_PHONE_COUNTRY } from '@/lib/phone'

export interface ContactCsvRow {
  name: string
  company: string
  designation: string
  email: string
  phone: string
  mobile: string
  address: string
}

export const CONTACT_CSV_COLUMNS: CsvColumn<ContactCsvRow>[] = [
  { key: 'name', header: 'Name' },
  { key: 'company', header: 'Company' },
  { key: 'designation', header: 'Designation' },
  { key: 'email', header: 'Email' },
  { key: 'phone', header: 'Phone', asText: true },
  { key: 'mobile', header: 'Mobile', asText: true },
  { key: 'address', header: 'Address' },
]

/**
 * Normalise a raw CRM value into the text that should appear in the CSV.
 * null/undefined -> ''; strings are trimmed; placeholder tokens that the table
 * renders as "—" become empty cells so the CSV never contains literally
 * "—"/"null"/"undefined"/"NaN".
 */
export function displayValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  const str = String(value).trim()
  if (str === '—' || str === '-' || str === 'null' || str === 'undefined' || str === 'NaN') {
    return ''
  }
  return str
}

/** Map raw contacts to the seven export fields only — drops owner/status/ids/etc. */
export function toContactCsvRows(
  contacts: Partial<Pick<Contact, keyof ContactCsvRow>>[],
): ContactCsvRow[] {
  return contacts.map((c) => ({
    name: displayValue(c.name),
    company: displayValue(c.company),
    designation: displayValue(c.designation),
    email: displayValue(c.email),
    phone: withCountryCode(displayValue(c.phone)),
    mobile: withCountryCode(displayValue(c.mobile)),
    address: displayValue(c.address),
  }))
}

/** Plain CSV (header + rows, RFC 4180, Phone/Mobile as Excel text). */
export function contactsToCsv(contacts: Partial<Pick<Contact, keyof ContactCsvRow>>[]): string {
  return toCSV(toContactCsvRows(contacts), CONTACT_CSV_COLUMNS)
}

/** CSV prefixed with a UTF-8 BOM so Excel opens it with correct encoding. */
export function contactsToExcelCsv(contacts: Partial<Pick<Contact, keyof ContactCsvRow>>[]): string {
  return CSV_BOM + contactsToCsv(contacts)
}
