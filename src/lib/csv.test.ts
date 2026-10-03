import { describe, it, expect } from 'vitest'
import { toCSV, csvResponse, parseCSV, excelText } from './csv'

describe('toCSV', () => {
  it('renders a header row and one row per record, in column order', () => {
    const csv = toCSV(
      [
        { name: 'Ada Lovelace', role: 'Engineer' },
        { name: 'Grace Hopper', role: 'Admiral' },
      ],
      [
        { key: 'name', header: 'Name' },
        { key: 'role', header: 'Role' },
      ]
    )
    const lines = csv.split('\r\n')
    expect(lines[0]).toBe('Name,Role')
    expect(lines[1]).toBe('Ada Lovelace,Engineer')
    expect(lines[2]).toBe('Grace Hopper,Admiral')
  })

  it('quotes a field containing a comma', () => {
    const csv = toCSV([{ location: 'Bengaluru, India' }], [{ key: 'location', header: 'Location' }])
    expect(csv).toContain('"Bengaluru, India"')
  })

  it('quotes a field containing a newline', () => {
    const csv = toCSV([{ notes: 'line one\nline two' }], [{ key: 'notes', header: 'Notes' }])
    expect(csv).toContain('"line one\nline two"')
  })

  it('doubles embedded quotes and wraps the whole field in quotes (RFC 4180)', () => {
    const csv = toCSV([{ quote: 'She said "hello"' }], [{ key: 'quote', header: 'Quote' }])
    expect(csv.split('\r\n')[1]).toBe('"She said ""hello"""')
  })

  it('does not quote a plain field with no special characters', () => {
    const csv = toCSV([{ status: 'Active' }], [{ key: 'status', header: 'Status' }])
    expect(csv.split('\r\n')[1]).toBe('Active')
  })

  it('renders numbers as plain text without quoting', () => {
    const csv = toCSV([{ score: 87 }], [{ key: 'score', header: 'Score' }])
    expect(csv.split('\r\n')[1]).toBe('87')
  })

  it('renders null/undefined values as an empty field rather than the literal string "null"', () => {
    const csv = toCSV([{ notes: null as unknown as string }], [{ key: 'notes', header: 'Notes' }])
    expect(csv.split('\r\n')[1]).toBe('')
  })

  it('produces just the header row for an empty dataset', () => {
    const csv = toCSV([], [{ key: 'name', header: 'Name' }])
    expect(csv).toBe('Name')
  })

  it('renders null/undefined/NaN/Infinity as an empty field', () => {
    const csv = toCSV(
      [{ a: null, b: undefined, c: NaN, d: Infinity, e: -Infinity }],
      [
        { key: 'a', header: 'A' },
        { key: 'b', header: 'B' },
        { key: 'c', header: 'C' },
        { key: 'd', header: 'D' },
        { key: 'e', header: 'E' },
      ],
    )
    expect(csv).toBe('A,B,C,D,E\r\n,,,,')
  })

  it('quotes a bare carriage return (RFC 4180)', () => {
    const csv = toCSV([{ x: 'a\rb' }], [{ key: 'x', header: 'X' }])
    expect(csv.split('\r\n')[1]).toBe('"a\rb"')
  })

  it('wraps asText values in the Excel text form and leaves empty as empty', () => {
    const cols = [{ key: 'phone', header: 'Phone', asText: true }]
    const csv = toCSV([{ phone: '914444212345' }, { phone: '' }], cols)
    const rows = csv.split('\r\n')
    expect(rows[0]).toBe('Phone')
    // raw RFC-escaped form of excelText('914444212345')
    expect(rows[1]).toBe('"=""914444212345"""')
    // empty asText value stays a bare empty cell (no ="")
    expect(rows[2]).toBe('')
    // round-trip: parseCSV decodes the non-empty cell back to the ="..." form
    expect(parseCSV(rows[0] + '\r\n' + rows[1]).rows[0].Phone).toBe('="914444212345"')
  })
})

describe('excelText', () => {
  it('wraps a bare value in the ="..." text formula', () => {
    expect(excelText('914444212345')).toBe('="914444212345"')
  })

  it('doubles embedded double quotes before wrapping', () => {
    expect(excelText('She said "hi"')).toBe('="She said ""hi"""')
  })
})

describe('csvResponse', () => {
  it('sets a CSV content type and an attachment disposition with the given filename', () => {
    const res = csvResponse('a,b\r\n1,2', 'export.csv')
    expect(res.headers.get('Content-Type')).toContain('text/csv')
    expect(res.headers.get('Content-Disposition')).toBe('attachment; filename="export.csv"')
  })

  it('returns the CSV content unchanged as the response body', async () => {
    const res = csvResponse('a,b\r\n1,2', 'export.csv')
    expect(await res.text()).toBe('a,b\r\n1,2')
  })
})

describe('parseCSV', () => {
  it('parses a header row and data rows into keyed objects', () => {
    const result = parseCSV('Name,Email\r\nAda,ada@example.com\r\nGrace,grace@example.com')
    expect(result.headers).toEqual(['Name', 'Email'])
    expect(result.rows).toEqual([
      { Name: 'Ada', Email: 'ada@example.com' },
      { Name: 'Grace', Email: 'grace@example.com' },
    ])
  })

  it('is the exact inverse of toCSV for plain data (round-trips correctly)', () => {
    const original = [
      { Name: 'Ada', Company: 'Analytical Engines' },
      { Name: 'Grace', Company: 'US Navy' },
    ]
    const csv = toCSV(original, [
      { key: 'Name', header: 'Name' },
      { key: 'Company', header: 'Company' },
    ])
    const parsed = parseCSV(csv)
    expect(parsed.rows).toEqual(original)
  })

  it('handles a quoted field containing a comma', () => {
    const result = parseCSV('Name,Location\r\nAda,"Bengaluru, India"')
    expect(result.rows[0].Location).toBe('Bengaluru, India')
  })

  it('handles a quoted field containing a newline', () => {
    const result = parseCSV('Name,Notes\r\nAda,"line one\nline two"')
    expect(result.rows[0].Notes).toBe('line one\nline two')
  })

  it('un-escapes doubled quotes back to a single quote', () => {
    const result = parseCSV('Name,Quote\r\nAda,"She said ""hello"""')
    expect(result.rows[0].Quote).toBe('She said "hello"')
  })

  it('fills a missing trailing field with an empty string rather than throwing', () => {
    const result = parseCSV('Name,Email,Phone\r\nAda,ada@example.com')
    expect(result.rows[0]).toEqual({ Name: 'Ada', Email: 'ada@example.com', Phone: '' })
  })

  it('returns empty headers and rows for empty input', () => {
    const result = parseCSV('')
    expect(result.headers).toEqual([])
    expect(result.rows).toEqual([])
  })

  it('handles a file with only a header row', () => {
    const result = parseCSV('Name,Email')
    expect(result.headers).toEqual(['Name', 'Email'])
    expect(result.rows).toEqual([])
  })

  it('trims whitespace from header names and cell values', () => {
    const result = parseCSV('Name , Email \r\n Ada , ada@example.com ')
    expect(result.headers).toEqual(['Name', 'Email'])
    expect(result.rows[0]).toEqual({ Name: 'Ada', Email: 'ada@example.com' })
  })
})
