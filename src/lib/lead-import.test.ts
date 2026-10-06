import { describe, it, expect, vi } from 'vitest'
vi.unmock('exceljs')
import ExcelJS from 'exceljs'
import {
  importLeadsFromFile,
  mapLeadHeaders,
  normalizeLeadRow,
} from './lead-import'

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

describe('mapLeadHeaders', () => {
  it('maps the sales-sheet column names', () => {
    const headers = [
      'No',
      'Date',
      'Customer Name',
      'City',
      'Country',
      'Pin Code',
      'Contact Person',
      'Designation',
      'Email',
      'Lead source',
      'Purpose of Visit',
      'Meeting at',
      'Products Discussed',
      'Key Discussion Points',
      'Customer Requirement',
      'Grade',
      'Status',
      'CDA Status / date',
      'Sampling Status',
      'Feedback From R&D Team',
      'Remark',
      'Next Follow-up',
      'LOA - 3-10-2026',
    ]
    const { mapping, missingRequired, unmappedHeaders } = mapLeadHeaders(headers)
    expect(missingRequired).toEqual([])
    expect(mapping['Customer Name']).toBe('company')
    expect(mapping['Contact Person']).toBe('contactPerson')
    expect(mapping['Designation']).toBe('designation')
    expect(mapping['Lead source']).toBe('source')
    expect(mapping['Purpose of Visit']).toBe('purposeOfVisit')
    expect(mapping['Meeting at']).toBe('meetingAt')
    expect(mapping['Products Discussed']).toBe('productsDiscussed')
    expect(mapping['Key Discussion Points']).toBe('keyDiscussion')
    expect(mapping['Customer Requirement']).toBe('requirement')
    expect(mapping['Grade']).toBe('grade')
    expect(mapping['Status']).toBe('status')
    expect(mapping['CDA Status / date']).toBe('cdaStatus')
    expect(mapping['Sampling Status']).toBe('samplingStatus')
    expect(mapping['Feedback From R&D Team']).toBe('rdFeedback')
    expect(mapping['Remark']).toBe('remark')
    expect(mapping['Next Follow-up']).toBe('nextFollowUp')
    expect(mapping['LOA - 3-10-2026']).toBe('loaStatus')
    expect(mapping['City']).toBe('city')
    expect(mapping['Country']).toBe('country')
    expect(mapping['Pin Code']).toBe('pinCode')
    expect(unmappedHeaders).toEqual(['No'])
  })
})

describe('normalizeLeadRow', () => {
  it('falls back from name to contactPerson to company', () => {
    const mapped = { company: 'Acme', contactPerson: 'Jane', email: '', phone: '' }
    const result = normalizeLeadRow(mapped, 1)
    expect(result?.data.name).toBe('Jane')
  })

  it('falls back to company when contactPerson is blank', () => {
    const mapped = { company: 'Acme Corp', contactPerson: '', email: '', phone: '' }
    const result = normalizeLeadRow(mapped, 1)
    expect(result?.data.name).toBe('Acme Corp')
  })

  it('requires name >= 2 chars', () => {
    const mapped = { name: 'A', company: '', contactPerson: '', email: '', phone: '' }
    const result = normalizeLeadRow(mapped, 1)
    expect(result?.errors).toContain('Name is required (min 2 characters)')
  })
})

describe('importLeadsFromFile', () => {
  it('imports an xlsx sheet and maps the sales columns', async () => {
    const rows = [
      ['No', 'Date', 'Customer Name', 'City', 'Country', 'Pin Code', 'Contact Person', 'Designation', 'Email', 'Lead source', 'Purpose of Visit', 'Meeting at', 'Products Discussed', 'Key Discussion Points', 'Customer Requirement', 'Grade', 'Status', 'CDA Status / date', 'Sampling Status', 'Feedback From R&D Team', 'Remark', 'Next Follow-up', 'LOA - 3-10-2026'],
      [1, '01-Oct-2026', 'Acme Corp', 'Mumbai', 'India', '400001', 'Rahul Sharma', 'Manager', 'rahul@acme.com', 'Referral', 'Demo', 'Office', 'ArginExAct™', 'Bulk pricing', 'Samples needed', 'Pharmaceutical', 'open', 'Pending', 'Sent', 'Positive', 'Contact No.: 9326886243', '05-Oct-2026', 'Pending'],
    ]
    const buffer = await buildXlsx([{ name: 'Sheet1', rows }])
    const result = await importLeadsFromFile(file('leads.xlsx', buffer))
    expect(result.created).toBe(1)
    expect(result.skipped).toBe(0)
    expect(result.rowErrors).toHaveLength(0)
    const lead = result.rows[0]
    expect(lead.name).toBe('Rahul Sharma')
    expect(lead.company).toBe('Acme Corp')
    expect(lead.contactPerson).toBe('Rahul Sharma')
    expect(lead.email).toBe('rahul@acme.com')
    expect(lead.phone).toBe('9326886243')
    expect(lead.source).toBe('Referral')
    expect(lead.status).toBe('CONTACTED')
    expect(lead.segment).toBe('PHARMACEUTICAL')
    expect(lead.city).toBe('Mumbai')
    expect(lead.country).toBe('India')
    expect(lead.pinCode).toBe('400001')
    expect(lead.meetingAt).toBe('Office')
    expect(lead.productsDiscussed).toEqual(['ArginExAct™'])
    expect(lead.cdaStatus).toBe('Pending')
    expect(lead.samplingStatus).toBe('Sent')
    expect(lead.rdFeedback).toBe('Positive')
    expect(lead.nextFollowUp).toBeInstanceOf(Date)
    expect(lead.loaStatus).toBe('Pending')
  })

  it('dedupes repeats inside the file', async () => {
    const rows = [
      ['Name', 'Email'],
      ['Jane', 'jane@acme.com'],
      ['Jane', 'jane@acme.com'],
    ]
    const buffer = await buildXlsx([{ name: 'Sheet1', rows }])
    const result = await importLeadsFromFile(file('leads.xlsx', buffer))
    expect(result.created).toBe(1)
    expect(result.skipped).toBe(1)
    expect(result.rowErrors[0].message).toContain('duplicate')
  })

  it('dedupes against existing emails', async () => {
    const rows = [
      ['Name', 'Email'],
      ['Jane', 'jane@acme.com'],
    ]
    const buffer = await buildXlsx([{ name: 'Sheet1', rows }])
    const result = await importLeadsFromFile(file('leads.xlsx', buffer), {
      existingEmails: new Set(['jane@acme.com']),
    })
    expect(result.created).toBe(0)
    expect(result.skipped).toBe(1)
    expect(result.rowErrors[0].message).toContain('already exists')
  })

  it('warns on bad email but still imports', async () => {
    const rows = [
      ['Name', 'Email'],
      ['Jane', 'not-an-email'],
    ]
    const buffer = await buildXlsx([{ name: 'Sheet1', rows }])
    const result = await importLeadsFromFile(file('leads.xlsx', buffer))
    expect(result.created).toBe(1)
    expect(result.warnings.length).toBeGreaterThanOrEqual(1)
    expect(result.rows[0].email).toBeUndefined()
  })
})
