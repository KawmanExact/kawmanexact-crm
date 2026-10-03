import { describe, it, expect } from 'vitest'
import {
  sanitizeFileNamePart,
  buildExportFilename,
  contentTypeFor,
} from '@/lib/report-engine'
import type { ExportFormat } from '@/lib/report-engine/types'

describe('report-engine index', () => {
  describe('sanitizeFileNamePart', () => {
    it('collapses non-alphanumerics to hyphens', () => {
      expect(sanitizeFileNamePart('My Report!@#$')).toBe('My-Report')
    })

    it('trims leading and trailing hyphens', () => {
      expect(sanitizeFileNamePart('---Report---')).toBe('Report')
    })

    it('caps length at 48 characters', () => {
      const longName = 'a'.repeat(60)
      expect(sanitizeFileNamePart(longName).length).toBe(48)
    })

    it('returns "Report" for empty or only-special-chars input', () => {
      expect(sanitizeFileNamePart('')).toBe('Report')
      expect(sanitizeFileNamePart('!@#$')).toBe('Report')
    })

    it('preserves alphanumeric characters', () => {
      expect(sanitizeFileNamePart('Report123')).toBe('Report123')
    })
  })

  describe('buildExportFilename', () => {
    it('generates correct filename for PDF', () => {
      const date = new Date('2026-01-15')
      const filename = buildExportFilename('Sales Report', 'pdf', date)
      expect(filename).toBe('Kawman-ExAct-Sales-Report-2026-01-15.pdf')
    })

    it('generates correct filename for CSV', () => {
      const date = new Date('2026-01-15')
      const filename = buildExportFilename('Sales Report', 'csv', date)
      expect(filename).toBe('Kawman-ExAct-Sales-Report-2026-01-15.csv')
    })

    it('generates correct filename for XLSX', () => {
      const date = new Date('2026-01-15')
      const filename = buildExportFilename('Sales Report', 'xlsx', date)
      expect(filename).toBe('Kawman-ExAct-Sales-Report-2026-01-15.xlsx')
    })

    it('generates correct filename for print (HTML)', () => {
      const date = new Date('2026-01-15')
      const filename = buildExportFilename('Sales Report', 'print', date)
      expect(filename).toBe('Kawman-ExAct-Sales-Report-2026-01-15.html')
    })

    it('sanitizes report name in filename', () => {
      const date = new Date('2026-01-15')
      const filename = buildExportFilename('My Report!@#$', 'pdf', date)
      expect(filename).toBe('Kawman-ExAct-My-Report-2026-01-15.pdf')
    })

    it('uses current date when not provided', () => {
      const filename = buildExportFilename('Test', 'pdf')
      expect(filename).toMatch(/^Kawman-ExAct-Test-\d{4}-\d{2}-\d{2}\.pdf$/)
    })
  })

  describe('contentTypeFor', () => {
    it('returns correct content type for PDF', () => {
      expect(contentTypeFor('pdf')).toBe('application/pdf')
    })

    it('returns correct content type for XLSX', () => {
      expect(contentTypeFor('xlsx')).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    })

    it('returns correct content type for CSV', () => {
      expect(contentTypeFor('csv')).toBe('text/csv; charset=utf-8')
    })

    it('returns correct content type for print', () => {
      expect(contentTypeFor('print')).toBe('text/html; charset=utf-8')
    })

    it('returns octet-stream for unknown format', () => {
      expect(contentTypeFor('unknown' as ExportFormat)).toBe('application/octet-stream')
    })
  })
})