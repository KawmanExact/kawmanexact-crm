import { describe, it, expect } from 'vitest'
import { resolveCountry } from '@/lib/countries'

describe('resolveCountry', () => {
  describe('basic resolution', () => {
    it('resolves a country by its name', () => {
      expect(resolveCountry('India')?.iso2).toBe('IN')
      expect(resolveCountry('Norway')?.iso2).toBe('NO')
    })

    it('is case-insensitive for country names', () => {
      expect(resolveCountry('INDIA')?.iso2).toBe('IN')
      expect(resolveCountry('iNdIa')?.iso2).toBe('IN')
    })
  })

  describe('aliases', () => {
    it('resolves common short / alternate names', () => {
      const cases: Array<[string, string]> = [
        ['Bharat', 'IN'],
        ['Hindustan', 'IN'],
        ['USA', 'US'],
        ['America', 'US'],
        ['United States of America', 'US'],
        ['UK', 'GB'],
        ['Britain', 'GB'],
        ['UAE', 'AE'],
        ['Türkiye', 'TR'],
        ['Turkey', 'TR'],
        ['Turkiye', 'TR'],
        ['Czechia', 'CZ'],
        ['Czech', 'CZ'],
        ['Czech Republic', 'CZ'],
        ['Burma', 'MM'],
        ['Misr', 'EG'],
        ['Russia', 'RU'],
        ['Russian Federation', 'RU'],
        ['South Korea', 'KR'],
        ['Republic of Korea', 'KR'],
      ]
      for (const [input, iso2] of cases) {
        expect(resolveCountry(input)?.iso2).toBe(iso2)
      }
    })
  })

  describe('punctuation and diacritics', () => {
    it('folds punctuation', () => {
      expect(resolveCountry('U.S.A')?.iso2).toBe('US')
      expect(resolveCountry('  U.S.A.  ')?.iso2).toBe('US')
    })

    it('folds diacritics', () => {
      expect(resolveCountry('Türkiye')?.iso2).toBe('TR')
      expect(resolveCountry('Côte d\'Ivoire')?.iso2).toBe('CI')
      expect(resolveCountry('Cote d\'Ivoire')?.iso2).toBe('CI')
    })
  })

  describe('ISO2 upper-case only', () => {
    it('matches upper-case ISO2 codes', () => {
      expect(resolveCountry('IN')?.iso2).toBe('IN')
      expect(resolveCountry('US')?.iso2).toBe('US')
      expect(resolveCountry('NO')?.iso2).toBe('NO')
      expect(resolveCountry('IT')?.iso2).toBe('IT')
      expect(resolveCountry('GB')?.iso2).toBe('GB')
    })

    it('does NOT match lower-case ISO2 codes (no = Norway, it = Italy)', () => {
      expect(resolveCountry('no')).toBeNull()
      expect(resolveCountry('it')).toBeNull()
      expect(resolveCountry('us')).toBeNull()
      expect(resolveCountry('in')).toBeNull()
    })

    it('does NOT match mixed-case ISO2 codes', () => {
      expect(resolveCountry('No')).toBeNull()
      expect(resolveCountry('Us')).toBeNull()
      expect(resolveCountry('It')).toBeNull()
    })
  })

  describe('whole-string matching', () => {
    it('rejects partial matches', () => {
      expect(resolveCountry('Ind')).toBeNull()
      expect(resolveCountry('Indiaabc')).toBeNull()
      expect(resolveCountry('United')).toBeNull()
    })

    it('trims and accepts the exact name', () => {
      expect(resolveCountry('  India  ')?.iso2).toBe('IN')
      expect(resolveCountry('  ')).toBeNull()
    })
  })

  describe('null / blank / unknown', () => {
    it.each([null, undefined, '', '   ', '\n\t  '])('returns null for %p', (input) => {
      expect(resolveCountry(input)).toBeNull()
    })

    it('returns null for unknown countries', () => {
      expect(resolveCountry('Atlantis')).toBeNull()
      expect(resolveCountry('123')).toBeNull()
    })
  })

  describe('centroid', () => {
    it('returns lat/lng for plotting', () => {
      const r = resolveCountry('India')
      expect(r).toBeTruthy()
      expect(r!.iso2).toBe('IN')
      expect(r!.lat).toBeCloseTo(20.5937, 1)
      expect(r!.lng).toBeCloseTo(78.9629, 1)
    })
  })
})
