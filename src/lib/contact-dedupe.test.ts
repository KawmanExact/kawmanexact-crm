import { describe, it, expect } from 'vitest'
import { normalizeEmail, buildContactEmailKey, duplicateContactEmailMessage } from '@/lib/contact-dedupe'

describe('normalizeEmail', () => {
  it('trims and lowercases', () => {
    expect(normalizeEmail('  A@X.com ')).toBe('a@x.com')
    expect(normalizeEmail('PRASHANt@KawmanExact.COM')).toBe('prashant@kawmanexact.com')
  })

  it('returns empty string for null/undefined/empty', () => {
    expect(normalizeEmail(null)).toBe('')
    expect(normalizeEmail(undefined)).toBe('')
    expect(normalizeEmail('')).toBe('')
    expect(normalizeEmail('   ')).toBe('')
  })

  it('handles already-normalised values', () => {
    expect(normalizeEmail('a@x.com')).toBe('a@x.com')
    expect(normalizeEmail('a.b@c.d.com')).toBe('a.b@c.d.com')
  })
})

describe('buildContactEmailKey', () => {
  it('returns null when email is empty/null/undefined/whitespace', () => {
    expect(buildContactEmailKey(null)).toBeNull()
    expect(buildContactEmailKey(undefined)).toBeNull()
    expect(buildContactEmailKey('')).toBeNull()
    expect(buildContactEmailKey('   ')).toBeNull()
  })

  it('returns the normalised email for valid values', () => {
    expect(buildContactEmailKey('a@x.com')).toBe('a@x.com')
    expect(buildContactEmailKey('  A@X.com ')).toBe('a@x.com')
  })

  it('treats case/space variants as the same key', () => {
    expect(buildContactEmailKey('  A@X.com ')).toBe(buildContactEmailKey('a@x.com'))
    expect(buildContactEmailKey('A@X.COM')).toBe(buildContactEmailKey('a@x.com'))
  })

  it('produces different keys for different emails', () => {
    expect(buildContactEmailKey('a@x.com')).not.toBe(buildContactEmailKey('b@x.com'))
  })

  it('returns exactly the normalised email (no extra encoding)', () => {
    expect(buildContactEmailKey('  PRASHANt@KawmanExact.COM  ')).toBe('prashant@kawmanexact.com')
  })
})

describe('duplicateContactEmailMessage', () => {
  it('includes the existing contact name', () => {
    expect(duplicateContactEmailMessage('PRASHANT PATIL')).toBe(
      'A contact with this email already exists (PRASHANT PATIL).',
    )
  })
})
