import { describe, it, expect } from 'vitest'
import { generateReportCsv, generateReportCsvPerTable } from '@/lib/report-engine/csv-export'
import type { UniversalReportDefinition } from '@/lib/report-engine/types'

describe('report-engine csv-export', () => {
  const baseReport: UniversalReportDefinition = {
    name: 'test-report',
    title: 'Test Report',
    columns: [
      { key: 'name', header: 'Name' },
      { key: 'value', header: 'Value', format: 'currency' },
    ],
    rows: [
      { name: 'Item 1', value: 100 },
      { name: 'Item 2', value: 200 },
    ],
  }

  describe('generateReportCsv', () => {
    it('generates CSV for single table report', () => {
      const { csv, tableCount } = generateReportCsv(baseReport)

      expect(tableCount).toBe(1)
      expect(csv).toContain('Name,Value')
      expect(csv).toContain('Item 1,100')
      expect(csv).toContain('Item 2,200')
      expect(csv).toMatch(/^Name,Value/) // starts with header
    })

    it('generates CSV with multiple tables', () => {
      const multiTableReport: UniversalReportDefinition = {
        name: 'multi',
        title: 'Multi Table',
        tables: [
          {
            title: 'Table 1',
            columns: [{ key: 'a', header: 'A' }],
            rows: [{ a: '1' }],
          },
          {
            title: 'Table 2',
            columns: [{ key: 'b', header: 'B' }],
            rows: [{ b: '2' }],
          },
        ],
      }

      const { csv, tableCount } = generateReportCsv(multiTableReport)

      expect(tableCount).toBe(2)
      expect(csv).toContain('# Table 1')
      expect(csv).toContain('A')
      expect(csv).toContain('1')
      expect(csv).toContain('# Table 2')
      expect(csv).toContain('B')
      expect(csv).toContain('2')
    })

    it('returns empty CSV for report with no data', () => {
      const emptyReport: UniversalReportDefinition = {
        name: 'empty',
        title: 'Empty',
      }

      const { csv, tableCount } = generateReportCsv(emptyReport)

      expect(csv).toBe('')
      expect(tableCount).toBe(0)
    })

    it('renders a csvText column as an Excel text formula cell', () => {
      const report: UniversalReportDefinition = {
        name: 'csvtext',
        title: 'csvText',
        columns: [
          { key: 'a', header: 'A' },
          { key: 'phone', header: 'Phone', csvText: true },
        ],
        rows: [{ a: 'A', phone: '914444212345' }],
      }

      const { csv } = generateReportCsv(report)

      expect(csv).toBe('A,Phone\r\nA,"=""914444212345"""')
    })

    it('handles special characters in cell values', () => {
      const specialReport: UniversalReportDefinition = {
        name: 'special',
        title: 'Special',
        columns: [{ key: 'text', header: 'Text' }],
        rows: [
          { text: 'Hello, World' }, // comma
          { text: 'Line 1\nLine 2' }, // newline
          { text: 'She said "Hello"' }, // quotes
        ],
      }

      const { csv } = generateReportCsv(specialReport)

      expect(csv).toContain('"Hello, World"')
      expect(csv).toContain('"Line 1\nLine 2"')
      expect(csv).toContain('"She said ""Hello"""')
    })
  })

  describe('generateReportCsvPerTable', () => {
    it('returns array of CSVs for each table', () => {
      const multiTableReport: UniversalReportDefinition = {
        name: 'multi',
        title: 'Multi Table',
        tables: [
          {
            title: 'Table 1',
            columns: [{ key: 'a', header: 'A' }],
            rows: [{ a: '1' }],
          },
          {
            title: 'Table 2',
            columns: [{ key: 'b', header: 'B' }],
            rows: [{ b: '2' }],
          },
        ],
      }

      const results = generateReportCsvPerTable(multiTableReport)

      expect(results).toHaveLength(2)
      expect(results[0].title).toBe('Table 1')
      expect(results[0].csv).toContain('A')
      expect(results[0].csv).toContain('1')
      expect(results[1].title).toBe('Table 2')
      expect(results[1].csv).toContain('B')
      expect(results[1].csv).toContain('2')
    })

    it('uses default title when table has no title', () => {
      const report: UniversalReportDefinition = {
        name: 'test',
        title: 'Test',
        tables: [
          {
            columns: [{ key: 'a', header: 'A' }],
            rows: [{ a: '1' }],
          },
        ],
      }

      const results = generateReportCsvPerTable(report)

      expect(results[0].title).toBe('Table 1')
    })

    it('returns empty array for report with no tables', () => {
      const emptyReport: UniversalReportDefinition = {
        name: 'empty',
        title: 'Empty',
      }

      const results = generateReportCsvPerTable(emptyReport)

      expect(results).toHaveLength(0)
    })
  })
})