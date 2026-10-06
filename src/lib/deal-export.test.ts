import { describe, it, expect } from 'vitest'
import { vi } from 'vitest'

vi.unmock('exceljs')

import { DEAL_EXPORT_COLUMNS, toExportRow } from '@/lib/deal-export-columns'
import { buildDealExportWorkbook } from '@/lib/deal-export-workbook'
import { toCSV, CSV_BOM } from '@/lib/csv'
import ExcelJS from 'exceljs'

describe('Deal export columns', () => {
  it('has exactly 25 columns in the specified order with correct headers', () => {
    expect(DEAL_EXPORT_COLUMNS).toHaveLength(25)
    const expectedHeaders = [
      'No',
      'Date',
      'Customer Name',
      'City',
      'Country',
      'Pincode',
      'Contact Person',
      'Contact Number',
      'Designation',
      'Email',
      'Lead source',
      'Purpose of Visit',
      'Meeting at',
      'Products Discussed',
      'Key Discussion Points',
      'Customer Requirement',
      'Grade',
      'Application',
      'Status',
      'CDA Status / date',
      'Sampling Status',
      'Feedback From R&D Team',
      'Remark',
      'Next Follow-up',
      'LOA',
    ]
    expect(DEAL_EXPORT_COLUMNS.map((c) => c.header)).toEqual(expectedHeaders)
  })

  it('does not contain Location or Region', () => {
    const headers = DEAL_EXPORT_COLUMNS.map((c) => c.header.toLowerCase())
    expect(headers).not.toContain('location')
    expect(headers).not.toContain('region')
  })

  it('maps a raw deal row correctly', () => {
    const raw = {
      name: 'Deal 1',
      company: { name: 'Acme Corp' },
      contact: { name: 'Rahul Sharma', phone: '+91 98765 43210' },
      meetingDate: '2026-10-01',
      city: 'Mumbai',
      country: 'India',
      pinCode: '400001',
      contactPerson: 'Rahul Sharma',
      designation: 'Manager',
      email: 'rahul@acme.com',
      phone: '9326886243',
      source: 'Referral',
      purposeOfVisit: 'Demo',
      meetingAt: 'Office',
      productsDiscussed: ['ArginExAct™'],
      customProductNames: [],
      keyDiscussionPoints: 'Bulk pricing',
      customerRequirement: 'Samples needed',
      grade: 'Pharmaceutical',
      stage: 'PROSPECT',
      cdaStatus: 'Pending',
      samplingStatus: 'Sent',
      rndFeedback: 'Positive',
      remark: 'Contact No.: 9326886243',
      nextFollowUp: '2026-10-05',
      loaStatus: 'Pending',
    }

    const row = toExportRow(raw as any, 0)
    expect(row.no).toBe(1)
    expect(row.customerName).toBe('Acme Corp')
    expect(row.city).toBe('Mumbai')
    expect(row.country).toBe('India')
    expect(row.pincode).toBe('400001')
    expect(row.contactNumber).toBe('+91 98765 43210')
    expect(row.email).toBe('rahul@acme.com')
    expect(row.productsDiscussed).toBe('ArginExAct™')
    expect(row.status).toBe('PROSPECT')
    expect(row.nextFollowUp).toBe('05-Oct-2026')
  })

  it('preserves leading zeros in pincode and phone', () => {
    const raw = {
      name: 'Deal',
      company: null,
      contact: null,
      meetingDate: null,
      city: '',
      country: '',
      pinCode: '0123',
      contactPerson: null,
      designation: null,
      email: '',
      phone: '09876543210',
      source: '',
      purposeOfVisit: null,
      meetingAt: null,
      productsDiscussed: [],
      customProductNames: [],
      keyDiscussionPoints: null,
      customerRequirement: null,
      grade: null,
      stage: 'SUSPECT',
      cdaStatus: null,
      samplingStatus: null,
      rndFeedback: null,
      remark: null,
      nextFollowUp: null,
      loaStatus: null,
    }

    const row = toExportRow(raw as any, 0)
    expect(row.pincode).toBe('0123')
    expect(row.contactNumber).toBe('09876543210')
  })
})

describe('Deal export workbook', () => {
  it('has exactly the sheets Summary, Deals, Notes in that order', async () => {
    const rows = [
      toExportRow({
        name: 'Deal 1',
        company: { name: 'Acme' },
        contact: null,
        meetingDate: '2026-10-01',
        city: 'Mumbai',
        country: 'India',
        pinCode: '400001',
        contactPerson: 'Rahul',
        designation: 'Mgr',
        email: 'r@a.com',
        phone: '9876543210',
        source: 'Referral',
        purposeOfVisit: 'Demo',
        meetingAt: 'Office',
        productsDiscussed: [],
        customProductNames: [],
        keyDiscussionPoints: null,
        customerRequirement: null,
        grade: null,
        stage: 'PROSPECT',
        cdaStatus: null,
        samplingStatus: null,
        rndFeedback: null,
        remark: null,
        nextFollowUp: '2026-10-05',
        loaStatus: null,
      } as any, 0),
    ]

    const buffer = await buildDealExportWorkbook(rows, {
      organizationName: 'Test Org',
      generatedBy: 'Test User',
      generatedAt: new Date(),
      filters: [],
    })

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer)
    const sheetNames = wb.worksheets.map((ws) => ws.name)
    expect(sheetNames).toEqual(['Summary', 'Deals', 'Notes'])
  })

  it('writes the 24 headers in row 2 of the Deals sheet', async () => {
    const rows = [
      toExportRow({
        name: 'Deal 1',
        company: { name: 'Acme' },
        contact: null,
        meetingDate: '2026-10-01',
        city: 'Mumbai',
        country: 'India',
        pinCode: '400001',
        contactPerson: 'Rahul',
        designation: 'Mgr',
        email: 'r@a.com',
        phone: '9876543210',
        source: 'Referral',
        purposeOfVisit: 'Demo',
        meetingAt: 'Office',
        productsDiscussed: [],
        customProductNames: [],
        keyDiscussionPoints: null,
        customerRequirement: null,
        grade: null,
        stage: 'PROSPECT',
        cdaStatus: null,
        samplingStatus: null,
        rndFeedback: null,
        remark: null,
        nextFollowUp: '2026-10-05',
        loaStatus: null,
      } as any, 0),
    ]

    const buffer = await buildDealExportWorkbook(rows, {
      organizationName: 'Test Org',
      generatedBy: 'Test User',
      generatedAt: new Date(),
      filters: [],
    })

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer)
    const dealsSheet = wb.getWorksheet('Deals')
    expect(dealsSheet).toBeDefined()

    const headerRow = dealsSheet!.getRow(2)
    const headers: string[] = []
    for (let i = 1; i <= DEAL_EXPORT_COLUMNS.length; i++) {
      headers.push(String(headerRow.getCell(i).value ?? ''))
    }
    expect(headers).toEqual(DEAL_EXPORT_COLUMNS.map((c) => c.header))
    expect(headers).not.toContain('Location')
    expect(headers).not.toContain('Region')
  })

  it('keeps pincode and contact number as text in Excel', async () => {
    const rows = [
      toExportRow({
        name: 'Deal',
        company: null,
        contact: null,
        meetingDate: null,
        city: '',
        country: '',
        pinCode: '0123',
        contactPerson: null,
        designation: null,
        email: '',
        phone: '+91 98765 43210',
        source: '',
        purposeOfVisit: null,
        meetingAt: null,
        productsDiscussed: [],
        customProductNames: [],
        keyDiscussionPoints: null,
        customerRequirement: null,
        grade: null,
        stage: 'SUSPECT',
        cdaStatus: null,
        samplingStatus: null,
        rndFeedback: null,
        remark: null,
        nextFollowUp: null,
        loaStatus: null,
      } as any, 0),
    ]

    const buffer = await buildDealExportWorkbook(rows, {
      organizationName: 'Test Org',
      generatedBy: 'Test User',
      generatedAt: new Date(),
      filters: [],
    })

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer)
    const dealsSheet = wb.getWorksheet('Deals')
    const dataRow = dealsSheet!.getRow(3)

    const pincodeCell = dataRow.getCell(6)
    const contactCell = dataRow.getCell(8)

    expect(pincodeCell.value).toBe('0123')
    expect(pincodeCell.numFmt).toBe('@')
    expect(contactCell.value).toBe('+91 98765 43210')
    expect(contactCell.numFmt).toBe('@')
  })

  it('summary total equals deals data row count', async () => {
    const rows = [
      toExportRow({
        name: 'Deal 1',
        company: { name: 'Acme' },
        contact: null,
        meetingDate: '2026-10-01',
        city: 'Mumbai',
        country: 'India',
        pinCode: '400001',
        contactPerson: 'Rahul',
        designation: 'Mgr',
        email: 'r@a.com',
        phone: '9876543210',
        source: 'Referral',
        purposeOfVisit: 'Demo',
        meetingAt: 'Office',
        productsDiscussed: [],
        customProductNames: [],
        keyDiscussionPoints: null,
        customerRequirement: null,
        grade: null,
        stage: 'PROSPECT',
        cdaStatus: null,
        samplingStatus: null,
        rndFeedback: null,
        remark: null,
        nextFollowUp: '2026-10-05',
        loaStatus: null,
      } as any, 0),
      toExportRow({
        name: 'Deal 2',
        company: { name: 'Beta' },
        contact: null,
        meetingDate: '2026-10-02',
        city: 'Delhi',
        country: 'India',
        pinCode: '110001',
        contactPerson: 'Jane',
        designation: 'Dir',
        email: 'j@b.com',
        phone: '8765432109',
        source: 'Website',
        purposeOfVisit: 'Follow-up',
        meetingAt: 'Virtual',
        productsDiscussed: [],
        customProductNames: [],
        keyDiscussionPoints: null,
        customerRequirement: null,
        grade: null,
        stage: 'SUSPECT',
        cdaStatus: null,
        samplingStatus: null,
        rndFeedback: null,
        remark: null,
        nextFollowUp: null,
        loaStatus: null,
      } as any, 1),
    ]

    const buffer = await buildDealExportWorkbook(rows, {
      organizationName: 'Test Org',
      generatedBy: 'Test User',
      generatedAt: new Date(),
      filters: [],
    })

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer)
    const summarySheet = wb.getWorksheet('Summary')
    expect(summarySheet).toBeDefined()

    let totalValue = ''
    summarySheet!.eachRow({ includeEmpty: false }, (row) => {
      const cellA = row.getCell(1)
      const cellB = row.getCell(2)
      if (String(cellA.value).includes('Total deals exported')) {
        totalValue = String(cellB.value ?? '')
      }
    })

    expect(totalValue).toBe('2')
  })
})

describe('Deal export CSV', () => {
  it('has a single header row with the 24 labels', () => {
    const rows = [
      toExportRow({
        name: 'Deal 1',
        company: { name: 'Acme' },
        contact: null,
        meetingDate: '2026-10-01',
        city: 'Mumbai',
        country: 'India',
        pinCode: '400001',
        contactPerson: 'Rahul',
        designation: 'Mgr',
        email: 'r@a.com',
        phone: '9876543210',
        source: 'Referral',
        purposeOfVisit: 'Demo',
        meetingAt: 'Office',
        productsDiscussed: [],
        customProductNames: [],
        keyDiscussionPoints: null,
        customerRequirement: null,
        grade: null,
        stage: 'PROSPECT',
        cdaStatus: null,
        samplingStatus: null,
        rndFeedback: null,
        remark: null,
        nextFollowUp: '2026-10-05',
        loaStatus: null,
      } as any, 0),
    ]

    const csvColumns = DEAL_EXPORT_COLUMNS.map((c) => ({
      key: c.key,
      header: c.header,
      asText: c.type === 'text' && (c.key === 'pincode' || c.key === 'contactNumber'),
    }))

    const csv = toCSV(rows as unknown as Record<string, unknown>[], csvColumns)
    const lines = csv.split('\r\n')
    expect(lines[0]).toBe(DEAL_EXPORT_COLUMNS.map((c) => c.header).join(','))
    expect(lines).toHaveLength(2) // header + 1 data row
  })
})

