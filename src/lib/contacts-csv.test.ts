import { describe, it, expect } from 'vitest'
import { parseCSV, CSV_BOM, excelText } from '@/lib/csv'
import {
  contactsToCsv,
  contactsToExcelCsv,
  CONTACT_CSV_COLUMNS,
  displayValue,
  withCountryCode,
} from '@/lib/contacts-csv'
import type { Contact } from '@/types/crm'

const SAMPLE: Contact = {
  id: 'c1',
  name: 'PRASHANT PATIL',
  company: 'kawmanexact',
  designation: 'Business Development and Marketing Executive',
  email: 'prashanth@kawmanexact.com',
  email2: 'prashanth.personal@gmail.com',
  phone: '914444212345',
  phone2: '914444212346',
  mobile: '918806329882',
  mobile2: '918806329883',
  address: '123 Main St, City, State',
  owner: 'Someone Else',
  ownerInitials: 'SE',
  status: 'ACTIVE',
  lastActivityAt: '2024-01-01T00:00:00.000Z',
}

describe('contacts-csv', () => {
  describe('column set', () => {
    it('exposes exactly the ten required columns in order', () => {
      expect(CONTACT_CSV_COLUMNS.map((c) => c.header)).toEqual([
        'Name',
        'Company',
        'Designation',
        'Email',
        'Email 2',
        'Phone',
        'Phone 2',
        'Mobile',
        'Mobile 2',
        'Address',
      ])
      expect(CONTACT_CSV_COLUMNS.filter((c) => c.asText).map((c) => c.key)).toEqual(['phone', 'phone2', 'mobile', 'mobile2'])
    })
  })

  describe('contactsToCsv', () => {
    it('has the exact header line', () => {
      expect(contactsToCsv([])).toBe('Name,Company,Designation,Email,Email 2,Phone,Phone 2,Mobile,Mobile 2,Address')
    })

    it('renders the sample contact with +91 codes and Excel text cells', () => {
      const csv = contactsToCsv([SAMPLE])
      const expected = [
        'Name,Company,Designation,Email,Email 2,Phone,Phone 2,Mobile,Mobile 2,Address',
        'PRASHANT PATIL,kawmanexact,Business Development and Marketing Executive,prashanth@kawmanexact.com,prashanth.personal@gmail.com,"=""+914444212345""","=""+914444212346""","=""+918806329882""","=""+918806329883""","123 Main St, City, State"',
      ].join('\r\n')
      expect(csv).toBe(expected)
    })

    it('strips Owner/Status/Last Activity/timestamps/ids from the output', () => {
      const csv = contactsToCsv([SAMPLE])
      expect(csv).not.toContain('Owner')
      expect(csv).not.toContain('Status')
      expect(csv).not.toContain('Last Activity')
      expect(csv).not.toContain('lastActivityAt')
      expect(csv).not.toContain('createdAt')
      expect(csv).not.toContain(SAMPLE.id)
      expect(csv).not.toContain('Someone Else')
      expect(csv).not.toContain('2024-01-01')
    })

    it('never produces scientific notation', () => {
      const csv = contactsToCsv([SAMPLE])
      expect(csv).not.toMatch(/\d\.\d+E\+\d+/i)
      expect(csv).not.toContain('9.14')
    })

    it('round-trips values into the correct columns via parseCSV', () => {
      const csv = contactsToCsv([SAMPLE])
      const row = parseCSV(csv).rows[0]
      expect(row.Name).toBe('PRASHANT PATIL')
      expect(row.Company).toBe('kawmanexact')
      expect(row.Designation).toBe('Business Development and Marketing Executive')
      expect(row.Email).toBe('prashanth@kawmanexact.com')
      expect(row['Email 2']).toBe('prashanth.personal@gmail.com')
      expect(row.Phone).toBe(excelText('+914444212345'))
      expect(row['Phone 2']).toBe(excelText('+914444212346'))
      expect(row.Mobile).toBe(excelText('+918806329882'))
      expect(row['Mobile 2']).toBe(excelText('+918806329883'))
      expect(row.Address).toBe('123 Main St, City, State')
    })

    it('leaves a leading-zero number (not a valid mobile) unchanged', () => {
      const csv = contactsToCsv([{ phone: '0044123456', mobile: '0044123456', phone2: '0044123457', mobile2: '0044123458' } as Contact])
      const row = parseCSV(csv).rows[0]
      expect(row.Phone).toBe('="0044123456"')
      expect(row['Phone 2']).toBe('="0044123457"')
      expect(row.Mobile).toBe('="0044123456"')
      expect(row['Mobile 2']).toBe('="0044123458"')
    })

    it('normalises an already-international +91 number to E.164 (no double prefix)', () => {
      const csv = contactsToCsv([{ phone: '+91 98806 32988', mobile: '+91 98806 32988', phone2: '+91 98806 32989', mobile2: '+91 98806 32990' } as Contact])
      const row = parseCSV(csv).rows[0]
      expect(row.Phone).toBe('="+919880632988"')
      expect(row['Phone 2']).toBe('="+919880632989"')
      expect(row.Mobile).toBe('="+919880632988"')
      expect(row['Mobile 2']).toBe('="+919880632990"')
    })

    it('decodes international numbers for US and UK contacts (stripping the ="..." wrapper)', () => {
      const contacts = [
        { name: 'US Contact', company: 'US Co', designation: 'Eng', email: 'us@test.com', email2: 'us2@test.com', phone: '14155552671', phone2: '14155552672', mobile: '+14155552671', mobile2: '+14155552673' },
        { name: 'UK Contact', company: 'UK Co', designation: 'Mgr', email: 'uk@test.com', email2: 'uk2@test.com', phone: '442071838750', phone2: '442071838751', mobile: '+442071838750', mobile2: '+442071838751' },
      ] as Contact[]
      const { rows } = parseCSV(contactsToCsv(contacts))
      expect(rows[0].Phone).toBe('="+14155552671"')
      expect(rows[0]['Phone 2']).toBe('="+14155552672"')
      expect(rows[0].Mobile).toBe('="+14155552671"')
      expect(rows[0]['Mobile 2']).toBe('="+14155552673"')
      expect(rows[1].Phone).toBe('="+442071838750"')
      expect(rows[1]['Phone 2']).toBe('="+442071838751"')
      expect(rows[1].Mobile).toBe('="+442071838750"')
      expect(rows[1]['Mobile 2']).toBe('="+442071838751"')
      expect(rows[0].Phone.replace(/^="(.*)"$/, '$1')).toBe('+14155552671')
      expect(rows[1].Mobile.replace(/^="(.*)"$/, '$1')).toBe('+442071838750')
    })

    it('treats null/undefined/NaN/"—" as empty cells (row A,,,,,,,,)', () => {
      const sparse = {
        name: 'A',
        company: null,
        designation: undefined,
        email: NaN,
        email2: null,
        phone: '—',
        phone2: undefined,
        mobile: '',
        mobile2: null,
        address: null,
      } as unknown as Contact
      const csv = contactsToCsv([sparse])
      const row = csv.split('\r\n')[1]
      expect(row).toBe('A,,,,,,,,,')
    })

    it('round-trips commas, quotes, and newlines in text cells', () => {
      const wild = {
        name: 'Doe, Jr.',
        company: 'Acme "Subsidiary"',
        designation: 'Line 1\nLine 2\r\nLine 3',
        email: 'a,b@example.com',
        email2: 'c,d@example.com',
        phone: '9876543210',
        phone2: '9876543211',
        mobile: '9876543212',
        mobile2: '9876543213',
        address: '456 Oak Ave, Suite 100',
      } as Contact
      const csv = contactsToCsv([wild])
      const row = parseCSV(csv).rows[0]
      expect(row.Name).toBe('Doe, Jr.')
      expect(row.Company).toBe('Acme "Subsidiary"')
      expect(row.Designation).toBe('Line 1\nLine 2\r\nLine 3')
      expect(row.Email).toBe('a,b@example.com')
      expect(row['Email 2']).toBe('c,d@example.com')
      expect(row.Phone).toBe(excelText('+919876543210'))
      expect(row['Phone 2']).toBe(excelText('+919876543211'))
      expect(row.Mobile).toBe(excelText('+919876543212'))
      expect(row['Mobile 2']).toBe(excelText('+919876543213'))
      expect(row.Address).toBe('456 Oak Ave, Suite 100')
    })
  })

  describe('BOM variant', () => {
    it('equals BOM + the plain csv', () => {
      const plain = contactsToCsv([SAMPLE])
      const bom = contactsToExcelCsv([SAMPLE])
      expect(bom.startsWith(CSV_BOM)).toBe(true)
      expect(bom.slice(CSV_BOM.length)).toBe(plain)
    })

    it('empty list still yields the BOM + header only', () => {
      expect(contactsToExcelCsv([])).toBe(CSV_BOM + 'Name,Company,Designation,Email,Email 2,Phone,Phone 2,Mobile,Mobile 2,Address')
    })
  })

  describe('displayValue', () => {
    it('collapses null/undefined/whitespace into empty', () => {
      expect(displayValue(null)).toBe('')
      expect(displayValue(undefined)).toBe('')
      expect(displayValue('   ')).toBe('')
    })

    it('treats placeholder tokens as empty', () => {
      expect(displayValue('—')).toBe('')
      expect(displayValue('-')).toBe('')
      expect(displayValue('null')).toBe('')
      expect(displayValue('undefined')).toBe('')
      expect(displayValue('NaN')).toBe('')
      expect(displayValue('  NaN  ')).toBe('')
    })

    it('trims and keeps real values', () => {
      expect(displayValue('  PRASHANT PATIL  ')).toBe('PRASHANT PATIL')
    })
  })

  describe('withCountryCode', () => {
    it('prefixes / normalises numbers to E.164 with the correct country code', () => {
      const cases: Array<[string, string]> = [
        ['9876543210', '+919876543210'], // local Indian mobile
        ['914444212345', '+914444212345'], // India code, missing +
        ['918806329882', '+918806329882'],
        [' 918806329882 ', '+918806329882'], // trimmed
        ['98806 32988', '+919880632988'], // spaces stripped when valid
        ['+919876543210', '+919876543210'], // already E.164
        ['+14155552671', '+14155552671'], // US
        ['14155552671', '+14155552671'], // US, missing +
        ['+1 415 555 2671', '+14155552671'], // formatted input normalised
        ['+442071838750', '+442071838750'], // UK
        ['442071838750', '+442071838750'], // UK, missing +
        ['00442071838750', '+442071838750'], // 00 international prefix
        ['+971501234567', '+971501234567'], // UAE
        ['971501234567', '+971501234567'],
        ['+8613812345678', '+8613812345678'], // China
      ]
      for (const [input, expected] of cases) {
        expect(withCountryCode(input)).toBe(expected)
      }
    })

    it('leaves invalid / ambiguous / empty values unchanged', () => {
      expect(withCountryCode('0044123456')).toBe('0044123456')
      expect(withCountryCode('02212345678')).toBe('02212345678')
      expect(withCountryCode('5551234')).toBe('5551234')
      expect(withCountryCode('abc')).toBe('abc')
      expect(withCountryCode('')).toBe('')
    })

    it('is idempotent (applying twice equals applying once)', () => {
      const samples = [
        '9876543210',
        '914444212345',
        '+919876543210',
        '02212345678',
        '00442071838750',
        '+1 415 555 2671',
        '',
        'abc',
      ]
      for (const v of samples) {
        expect(withCountryCode(withCountryCode(v))).toBe(withCountryCode(v))
      }
    })

    it('honours an explicit default country override', () => {
      expect(withCountryCode('2071838750', 'GB')).toBe('+442071838750')
    })
  })
})
