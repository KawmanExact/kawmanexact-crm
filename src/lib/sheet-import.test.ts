import { describe, it, expect, vi } from 'vitest'
// The global test setup stubs exceljs; these tests assert on what the real
// library produces when reading a workbook back.
vi.unmock('exceljs')
import ExcelJS from 'exceljs'
import {
  LEAD_IMPORT_HEADER_ALIASES,
  SHEET_ACCEPTED_EXTENSIONS,
  applyHeaderMapping,
  mapLeadHeaders,
  normalizeHeader,
  normalizeImportDate,
  parseDelimited,
  parseSheetFile,
  parseSpreadsheet,
  sheetFormatForFile,
} from './sheet-import'

/** Build a real .xlsx in memory so the parser is tested against actual bytes. */
async function buildXlsx(
  sheets: Array<{ name: string; rows: unknown[][] }>
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook()
  for (const spec of sheets) {
    const sheet = workbook.addWorksheet(spec.name)
    for (const row of spec.rows) sheet.addRow(row)
  }
  const buffer = await workbook.xlsx.writeBuffer()
  return buffer as ArrayBuffer
}

function file(name: string, data: ArrayBuffer | string): File {
  return new File([data], name)
}

describe('sheetFormatForFile', () => {
  it('detects .xlsx and .xlsm', () => {
    expect(sheetFormatForFile({ name: 'leads.xlsx' })).toBe('xlsx')
    expect(sheetFormatForFile({ name: 'LEADS.XLSX' })).toBe('xlsx')
    expect(sheetFormatForFile({ name: 'leads.xlsm' })).toBe('xlsx')
  })

  it('detects .csv', () => {
    expect(sheetFormatForFile({ name: 'leads.csv' })).toBe('csv')
    expect(sheetFormatForFile({ name: 'leads.txt' })).toBe('csv')
  })

  it('rejects the legacy .xls rather than silently reading zero rows', () => {
    expect(sheetFormatForFile({ name: 'leads.xls' })).toBeNull()
  })

  it('rejects an unknown extension', () => {
    expect(sheetFormatForFile({ name: 'leads.pdf' })).toBeNull()
    expect(sheetFormatForFile({ name: 'leads' })).toBeNull()
  })

  it('advertises exactly the extensions the file input accepts', () => {
    expect(SHEET_ACCEPTED_EXTENSIONS).toEqual(['.csv', '.xlsx', '.xlsm'])
  })
})

describe('parseSpreadsheet', () => {
  it('reads a header row and one object per data row', async () => {
    const buffer = await buildXlsx([
      {
        name: 'Leads',
        rows: [
          ['Name', 'Company', 'Email'],
          ['Jane Doe', 'Acme', 'jane@acme.com'],
          ['Ravi Kumar', 'Globex', 'ravi@globex.com'],
        ],
      },
    ])
    const sheet = await parseSpreadsheet(buffer)
    expect(sheet.headers).toEqual(['Name', 'Company', 'Email'])
    expect(sheet.rows).toEqual([
      { Name: 'Jane Doe', Company: 'Acme', Email: 'jane@acme.com' },
      { Name: 'Ravi Kumar', Company: 'Globex', Email: 'ravi@globex.com' },
    ])
  })

  it('reads numeric and date cells as the value the user sees', async () => {
    const buffer = await buildXlsx([
      {
        name: 'Leads',
        rows: [
          ['Name', 'Score', 'Last Contacted'],
          ['Jane Doe', 75, new Date(Date.UTC(2026, 2, 1))],
        ],
      },
    ])
    const sheet = await parseSpreadsheet(buffer)
    expect(sheet.rows[0].Score).toBe('75')
    expect(sheet.rows[0]['Last Contacted']).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('skips a title row above the real header', async () => {
    const buffer = await buildXlsx([
      {
        name: 'Sheet1',
        rows: [
          ['Kawman ExAct — Lead List'],
          ['Generated 2026-03-01'],
          [],
          ['Name', 'Company'],
          ['Jane Doe', 'Acme'],
        ],
      },
    ])
    const sheet = await parseSpreadsheet(buffer)
    expect(sheet.headers).toEqual(['Name', 'Company'])
    expect(sheet.rows).toEqual([{ Name: 'Jane Doe', Company: 'Acme' }])
  })

  it('skips blank spacer rows instead of reporting them as invalid leads', async () => {
    const buffer = await buildXlsx([
      {
        name: 'Sheet1',
        rows: [
          ['Name', 'Company'],
          ['Jane Doe', 'Acme'],
          ['', ''],
          ['Ravi Kumar', 'Globex'],
        ],
      },
    ])
    const sheet = await parseSpreadsheet(buffer)
    expect(sheet.rows).toHaveLength(2)
  })

  it('reads the first sheet with data when the workbook has several', async () => {
    const buffer = await buildXlsx([
      { name: 'Empty', rows: [[]] },
      { name: 'Instructions', rows: [['Please fill in the next sheet']] },
      { name: 'Leads', rows: [['Name'], ['Jane Doe']] },
    ])
    const sheet = await parseSpreadsheet(buffer)
    expect(sheet.rows).toEqual([{ Name: 'Jane Doe' }])
    expect(sheet.availableSheets).toEqual(['Empty', 'Instructions', 'Leads'])
  })

  it('can be told which sheet to read', async () => {
    const buffer = await buildXlsx([
      { name: 'Summary', rows: [['Total', '5']] },
      { name: 'Leads', rows: [['Name'], ['Jane Doe']] },
    ])
    const sheet = await parseSpreadsheet(buffer, 'Leads')
    expect(sheet.sheetName).toBe('Leads')
    expect(sheet.rows).toEqual([{ Name: 'Jane Doe' }])
  })

  it('handles a sheet that is completely empty', async () => {
    const buffer = await buildXlsx([{ name: 'Empty', rows: [] }])
    const sheet = await parseSpreadsheet(buffer)
    expect(sheet.rows).toEqual([])
    expect(sheet.headers).toEqual([])
  })

  it('preserves commas, quotes and newlines inside a cell', async () => {
    const buffer = await buildXlsx([
      {
        name: 'Sheet1',
        rows: [
          ['Name', 'Notes'],
          ['Jane Doe', 'Wants "bulk" pricing,\nsecond line'],
        ],
      },
    ])
    const sheet = await parseSpreadsheet(buffer)
    expect(sheet.rows[0].Notes).toContain('"bulk"')
    expect(sheet.rows[0].Notes).toContain('\n')
  })

  it('reads a formula cell by its cached result', async () => {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Sheet1')
    sheet.addRow(['Name', 'Value'])
    sheet.getCell('B2').value = { formula: '100*2', result: 200 }
    const buffer = (await workbook.xlsx.writeBuffer()) as ArrayBuffer
    const parsed = await parseSpreadsheet(buffer)
    expect(parsed.rows[0].Value).toBe('200')
  })
})

describe('parseDelimited', () => {
  it('reuses the RFC 4180 CSV parser', () => {
    const sheet = parseDelimited('name,company\r\n"Jane, A",Acme\r\n')
    expect(sheet.rows).toEqual([{ name: 'Jane, A', company: 'Acme' }])
  })

  it('reports the format as CSV', () => {
    expect(parseDelimited('name\r\nJane\r\n').sheetName).toBe('CSV')
  })
})

describe('parseSheetFile', () => {
  it('dispatches a .csv through the CSV parser', async () => {
    const { format, sheet } = await parseSheetFile(file('leads.csv', 'name\r\nJane\r\n'))
    expect(format).toBe('csv')
    expect(sheet.rows).toEqual([{ name: 'Jane' }])
  })

  it('dispatches a .xlsx through the workbook reader', async () => {
    const buffer = await buildXlsx([{ name: 'Leads', rows: [['Name'], ['Jane']] }])
    const { format, sheet } = await parseSheetFile(file('leads.xlsx', buffer))
    expect(format).toBe('xlsx')
    expect(sheet.rows).toEqual([{ Name: 'Jane' }])
  })

  it('refuses a .xls with an actionable message instead of importing nothing', async () => {
    await expect(parseSheetFile(file('leads.xls', 'x'))).rejects.toThrow(/save the sheet as \.xlsx/i)
  })
})

describe('normalizeHeader', () => {
  it('ignores case, spacing and punctuation', () => {
    expect(normalizeHeader('Company Name')).toBe('companyname')
    expect(normalizeHeader('company_name')).toBe('companyname')
    expect(normalizeHeader('COMPANY-NAME')).toBe('companyname')
    expect(normalizeHeader('  Company  Name  ')).toBe('companyname')
  })
})

describe('mapLeadHeaders', () => {
  it('maps our own exact column names', () => {
    const { mapping } = mapLeadHeaders(['name', 'company', 'email', 'phone'])
    expect(mapping).toEqual({ name: 'name', company: 'company', email: 'email', phone: 'phone' })
  })

  it('maps a real-world sheet that uses spaced and underscored headers', () => {
    const { mapping } = mapLeadHeaders([
      'Contact Name',
      'Company Name',
      'Email Address',
      'Mobile Number',
      'Lead Source',
      'Lead Status',
      'Lead Value',
      'Follow Up Notes',
    ])
    expect(mapping['Contact Name']).toBe('name')
    expect(mapping['Company Name']).toBe('company')
    expect(mapping['Email Address']).toBe('email')
    expect(mapping['Mobile Number']).toBe('phone')
    expect(mapping['Lead Source']).toBe('source')
    expect(mapping['Lead Status']).toBe('status')
    expect(mapping['Lead Value']).toBe('value')
    expect(mapping['Follow Up Notes']).toBe('notes')
  })

  it('maps the salesperson sheet columns the user actually has', () => {
    const { mapping } = mapLeadHeaders([
      'Name',
      'Organisation',
      'Email',
      'Telephone',
      'Products Discussed',
      'Stage',
      'Remarks',
      'Assigned To',
      'Last Followed Up',
    ])
    expect(mapping.Organisation).toBe('company')
    expect(mapping.Telephone).toBe('phone')
    expect(mapping['Products Discussed']).toBe('segment')
    expect(mapping.Stage).toBe('status')
    expect(mapping.Remarks).toBe('notes')
    expect(mapping['Assigned To']).toBe('ownerEmail')
    expect(mapping['Last Followed Up']).toBe('lastActivityAt')
  })

  it('reports the missing required column so the user is told what to rename', () => {
    const { missingRequired } = mapLeadHeaders(['company', 'email'])
    expect(missingRequired).toEqual(['name'])
  })

  it('is satisfied when a name-ish header exists', () => {
    expect(mapLeadHeaders(['Contact', 'company']).missingRequired).toEqual([])
  })

  it('lists the columns it will ignore', () => {
    const { unmappedHeaders } = mapLeadHeaders(['Name', 'Internal Ref', 'colour of the van'])
    expect(unmappedHeaders).toEqual(['Internal Ref', 'colour of the van'])
  })

  it('does not let one column claim two fields', () => {
    const { mapping } = mapLeadHeaders(['Name', 'notes'])
    const fields = Object.values(mapping)
    expect(new Set(fields).size).toBe(fields.length)
  })

  it('every alias in the table is a plausible normalised header', () => {
    for (const [field, aliases] of Object.entries(LEAD_IMPORT_HEADER_ALIASES)) {
      expect(aliases.length).toBeGreaterThan(0)
      for (const alias of aliases) {
        expect(normalizeHeader(alias)).toBe(normalizeHeader(alias))
        expect(alias).toBe(alias.toLowerCase())
      }
      expect(aliases.some((alias) => normalizeHeader(alias) === normalizeHeader(field))).toBe(true)
    }
  })
})

describe('applyHeaderMapping', () => {
  it('renames keys to field names', () => {
    const mapping = { 'Contact Name': 'name', 'Company Name': 'company' }
    expect(applyHeaderMapping({ 'Contact Name': 'Jane', 'Company Name': 'Acme' }, mapping)).toEqual({
      name: 'Jane',
      company: 'Acme',
    })
  })

  it('drops columns that were not mapped', () => {
    expect(applyHeaderMapping({ Name: 'Jane', Colour: 'red' }, { Name: 'name' })).toEqual({
      name: 'Jane',
    })
  })

  it('lets the first column win when two map to the same field', () => {
    const mapping = { Name: 'name', 'Full Name': 'name' }
    expect(applyHeaderMapping({ Name: 'First', 'Full Name': 'Second' }, mapping)).toEqual({
      name: 'First',
    })
  })

  it('turns a missing cell into an empty string so the caller can drop it', () => {
    expect(applyHeaderMapping({ Name: 'Jane' }, { Name: 'name', Company: 'company' })).toEqual({
      name: 'Jane',
    })
  })
})

describe('normalizeImportDate', () => {
  it('parses an ISO date without timezone drift', () => {
    const parsed = normalizeImportDate('2026-03-01')
    expect(parsed!.toISOString().slice(0, 10)).toBe('2026-03-01')
  })

  it('parses a single-digit ISO-ish date', () => {
    expect(normalizeImportDate('2026-3-1')!.toISOString().slice(0, 10)).toBe('2026-03-01')
  })

  it('rejects an ISO date with an impossible month or day', () => {
    expect(normalizeImportDate('2026-13-01')).toBeNull()
    expect(normalizeImportDate('2026-03-45')).toBeNull()
  })

  it('parses the other formats people type', () => {
    expect(normalizeImportDate('01-Mar-2026')!.toISOString().slice(0, 10)).toBe('2026-03-01')
    expect(normalizeImportDate('2026/03/01')!.toISOString().slice(0, 10)).toBe('2026-03-01')
  })

  it('returns null for blank or unparseable input rather than an Invalid Date', () => {
    expect(normalizeImportDate('')).toBeNull()
    expect(normalizeImportDate('   ')).toBeNull()
    expect(normalizeImportDate(null)).toBeNull()
    expect(normalizeImportDate('not a date')).toBeNull()
  })
})