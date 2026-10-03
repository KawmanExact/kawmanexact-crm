import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  prisma: {
    contact: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}))

vi.mock('@/lib/contact-dedupe', () => ({
  buildContactEmailKey: vi.fn((email: string | null) => (email ? email.trim().toLowerCase() : null)),
}))

import { prisma } from '@/lib/db'
import { findOrCreateContactByName, looksLikePhoneNumber } from '@/services/contact.service'

const mockFindFirst = vi.mocked(prisma.contact.findFirst)
const mockCreate = vi.mocked(prisma.contact.create)
const mockUpdate = vi.mocked(prisma.contact.update)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('looksLikePhoneNumber', () => {
  it('returns true for strings that look like phone numbers', () => {
    expect(looksLikePhoneNumber('+91 98765 43210')).toBe(true)
    expect(looksLikePhoneNumber('9876543210')).toBe(true)
    expect(looksLikePhoneNumber('+1-555-123-4567')).toBe(true)
  })

  it('returns false for regular names', () => {
    expect(looksLikePhoneNumber('Jane Doe')).toBe(false)
    expect(looksLikePhoneNumber('Acme Corp')).toBe(false)
    expect(looksLikePhoneNumber('5')).toBe(false)
  })
})

describe('findOrCreateContactByName — phone number safeguard', () => {
  it('returns null if name looks like a phone number and no matching mobile exists', async () => {
    mockFindFirst.mockResolvedValue(null)

    const result = await findOrCreateContactByName({
      name: '+91 98765 43210',
      organizationId: 'org-A',
      ownerId: 'user-1',
    })

    expect(result).toBeNull()
    expect(mockFindFirst).toHaveBeenCalledTimes(1)
    expect(mockFindFirst).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-A',
        mobile: { equals: '+91 98765 43210', mode: 'insensitive' },
      },
      select: { id: true, name: true },
    })
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('returns existing contact if mobile matches a phone-number-looking name', async () => {
    mockFindFirst.mockResolvedValue({ id: 'c-123', name: 'Jane Doe' })

    const result = await findOrCreateContactByName({
      name: '9876543210',
      organizationId: 'org-A',
      ownerId: 'user-1',
      email: 'jane@test.com',
    })

    expect(result).toEqual({ id: 'c-123', name: 'Jane Doe' })
    expect(mockCreate).not.toHaveBeenCalled()
  })
})

describe('findOrCreateContactByName — existing contact by name', () => {
  it('returns the existing contact', async () => {
    mockFindFirst.mockResolvedValue({ id: 'c-123', name: 'Jane Doe', email: 'jane@test.com', mobile: null })

    const result = await findOrCreateContactByName({
      name: 'jane doe',
      organizationId: 'org-A',
      ownerId: 'user-1',
      email: 'jane@old.com',
    })

    expect(result).toEqual({ id: 'c-123', name: 'Jane Doe' })
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('backfills missing email on match', async () => {
    mockFindFirst.mockResolvedValue({ id: 'c-123', name: 'Jane Doe', email: null, mobile: null })

    await findOrCreateContactByName({
      name: 'Jane Doe',
      organizationId: 'org-A',
      ownerId: 'user-1',
      email: 'new@test.com',
      mobile: '+91 99999 99999',
    })

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'c-123' },
      data: {
        email: 'new@test.com',
        mobile: '+91 99999 99999',
        lastActivityAt: expect.any(Date),
        emailKey: 'new@test.com',
      },
    })
  })

  it('does not backfill when existing contact already has email/mobile', async () => {
    mockFindFirst.mockResolvedValue({ id: 'c-123', name: 'Jane Doe', email: 'existing@test.com', mobile: '+91 00000 00000' })

    await findOrCreateContactByName({
      name: 'Jane Doe',
      organizationId: 'org-A',
      ownerId: 'user-1',
      email: 'new@test.com',
      mobile: '+91 99999 99999',
    })

    expect(mockUpdate).not.toHaveBeenCalled()
  })
})

describe('findOrCreateContactByName — new contact creation', () => {
  it('creates a new contact with full details', async () => {
    mockFindFirst.mockResolvedValue(null)
    mockCreate.mockResolvedValue({ id: 'c-new', name: 'Brand New Person' } as never)

    const result = await findOrCreateContactByName({
      name: 'Brand New Person',
      organizationId: 'org-A',
      ownerId: 'user-1',
      email: 'new@test.com',
      mobile: '+91 99999 99999',
    })

    expect(result).toEqual({ id: 'c-new', name: 'Brand New Person' })
    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        name: 'Brand New Person',
        organizationId: 'org-A',
        ownerId: 'user-1',
        companyId: null,
        email: 'new@test.com',
        phone: null,
        mobile: '+91 99999 99999',
        emailKey: 'new@test.com',
        lastActivityAt: expect.any(Date),
      },
      select: { id: true, name: true },
    })
  })

  it('creates a contact with nulls when only name is provided', async () => {
    mockFindFirst.mockResolvedValue(null)
    mockCreate.mockResolvedValue({ id: 'c-new', name: 'Just A Name' } as never)

    const result = await findOrCreateContactByName({
      name: 'Just A Name',
      organizationId: 'org-A',
      ownerId: 'user-1',
    })

    expect(result).toEqual({ id: 'c-new', name: 'Just A Name' })
    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'Just A Name',
        email: null,
        mobile: null,
        emailKey: null,
      }),
      select: { id: true, name: true },
    })
  })

  it('returns null for blank/whitespace-only name without lookup', async () => {
    const result = await findOrCreateContactByName({
      name: '',
      organizationId: 'org-A',
      ownerId: 'user-1',
    })

    expect(result).toBeNull()
    expect(mockFindFirst).not.toHaveBeenCalled()
    expect(mockCreate).not.toHaveBeenCalled()
  })
})
