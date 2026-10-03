import { describe, it, expect } from 'vitest'
import { buildReportHtml } from '@/lib/report-engine/html-template'
import type { UniversalReportDefinition } from '@/lib/report-engine/types'

describe('report-engine html-template', () => {
  const baseReport: UniversalReportDefinition = {
    name: 'test-report',
    title: 'Test Report',
    subtitle: 'Q1 2026',
    periodLabel: 'Jan 1 – Mar 31, 2026',
    metadata: {
      generatedAt: '2026-01-15T10:00:00Z',
      generatedBy: 'Admin',
      organizationName: 'Acme Corp',
      recordCount: 100,
    },
    filters: { 'Date Range': 'Jan 1 – Mar 31, 2026', Status: 'Active' },
  }

  describe('buildReportHtml', () => {
    it('generates valid HTML structure', () => {
      const { html } = buildReportHtml(baseReport)

      expect(html).toContain('<!DOCTYPE html>')
      expect(html).toContain('<html')
      expect(html).toContain('<head>')
      expect(html).toContain('<body>')
      expect(html).toContain('</html>')
    })

    it('includes report title in HTML', () => {
      const { html } = buildReportHtml(baseReport)

      expect(html).toContain('Test Report')
    })

    it('includes organization name in HTML', () => {
      const { html } = buildReportHtml(baseReport)

      expect(html).toContain('Acme Corp')
    })

    it('includes period label in HTML', () => {
      const { html } = buildReportHtml(baseReport)

      expect(html).toContain('Jan 1 – Mar 31, 2026')
    })

    it('includes filter chips when filters provided', () => {
      const { html } = buildReportHtml(baseReport)

      expect(html).toContain('Date Range')
      expect(html).toContain('Jan 1 – Mar 31, 2026')
      expect(html).toContain('Status')
      expect(html).toContain('Active')
    })

    it('includes metadata line with generated info', () => {
      const { html } = buildReportHtml(baseReport)

      // The HTML has <span class="meta-k">By</span> Admin, so "By Admin" is split by </span>
      expect(html).toContain('By')
      expect(html).toContain('Admin')
      
      // The HTML has <span class="meta-k">Records</span> 100, so "100 records" is split by </span>
      expect(html).toContain('Records')
      expect(html).toContain('100')
    })

    it('renders metrics as KPI cards', () => {
      const reportWithMetrics: UniversalReportDefinition = {
        ...baseReport,
        metrics: [
          { label: 'TOTAL LEADS', value: '1,248', tone: 'default' },
          { label: 'CONVERSION RATE', value: '24.5%', tone: 'success', trend: { value: '+2.1%', direction: 'up' } },
          { label: 'OVERDUE', value: '12', tone: 'danger' },
        ],
      }

      const { html } = buildReportHtml(reportWithMetrics)

      expect(html).toContain('TOTAL LEADS')
      expect(html).toContain('1,248')
      expect(html).toContain('CONVERSION RATE')
      expect(html).toContain('24.5%')
      expect(html).toContain('OVERDUE')
      expect(html).toContain('12')
    })

    it('renders tables with headers and rows', () => {
      const reportWithTable: UniversalReportDefinition = {
        ...baseReport,
        tables: [
          {
            title: 'Leads',
            columns: [
              { key: 'name', header: 'Name' },
              { key: 'email', header: 'Email' },
              { key: 'status', header: 'Status' },
            ],
            rows: [
              { name: 'John Doe', email: 'john@example.com', status: 'Active' },
              { name: 'Jane Smith', email: 'jane@example.com', status: 'Pending' },
            ],
          },
        ],
      }

      const { html } = buildReportHtml(reportWithTable)

      expect(html).toContain('Leads')
      expect(html).toContain('Name')
      expect(html).toContain('Email')
      expect(html).toContain('Status')
      expect(html).toContain('John Doe')
      expect(html).toContain('john@example.com')
      expect(html).toContain('Active')
      expect(html).toContain('Jane Smith')
      expect(html).toContain('Pending')
    })
  })
})