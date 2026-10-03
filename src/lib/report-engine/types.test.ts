import { describe, it, expect } from 'vitest'
import { normalizeReport } from '@/lib/report-engine/types'
import type { UniversalReportDefinition, LegacyReportDefinition } from '@/lib/report-engine/types'

describe('report-engine types', () => {
  describe('normalizeReport', () => {
    it('converts legacy definition to universal definition', () => {
      const legacy: LegacyReportDefinition = {
        name: 'legacy-report',
        title: 'Legacy Report',
        subtitle: 'Q1 2026',
        columns: [
          { key: 'name', header: 'Name' },
          { key: 'value', header: 'Value' },
        ],
        rows: [
          { name: 'Item 1', value: 100 },
        ],
        filters: { status: 'Active' },
        generatedAt: '2026-01-15T00:00:00Z',
        generatedBy: 'Admin',
        organizationName: 'Acme Corp',
      }

      const normalized = normalizeReport(legacy)

      expect(normalized.name).toBe('legacy-report')
      expect(normalized.title).toBe('Legacy Report')
      expect(normalized.subtitle).toBe('Q1 2026')
      expect(normalized.columns).toHaveLength(2)
      expect(normalized.rows).toHaveLength(1)
      expect(normalized.filters).toEqual({ status: 'Active' })
      expect(normalized.metadata?.generatedAt).toBe('2026-01-15T00:00:00Z')
      expect(normalized.metadata?.generatedBy).toBe('Admin')
      expect(normalized.metadata?.organizationName).toBe('Acme Corp')
      expect(normalized.tables).toHaveLength(1)
      expect(normalized.tables?.[0].columns).toHaveLength(2)
      expect(normalized.tables?.[0].rows).toHaveLength(1)
    })

    it('uses name as title when title not provided in legacy', () => {
      const legacy: LegacyReportDefinition = {
        name: 'legacy-report',
        columns: [{ key: 'name', header: 'Name' }],
        rows: [{ name: 'Item 1' }],
      }

      const normalized = normalizeReport(legacy)

      expect(normalized.title).toBe('legacy-report')
    })

    it('passes through universal definition unchanged', () => {
      const universal: UniversalReportDefinition = {
        name: 'universal',
        title: 'Universal Report',
        tables: [
          {
            title: 'Table 1',
            columns: [{ key: 'a', header: 'A' }],
            rows: [{ a: '1' }],
          },
        ],
        sections: [
          {
            title: 'Section 1',
            tables: [
              {
                columns: [{ key: 'b', header: 'B' }],
                rows: [{ b: '2' }],
              },
            ],
          },
        ],
      }

      const normalized = normalizeReport(universal)

      expect(normalized).toEqual(universal)
    })
  })
})