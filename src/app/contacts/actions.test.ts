import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  prisma: {
    contact: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    activity: { create: vi.fn() },
    company: { findFirst: vi.fn(), create: vi.fn() },
  },
}))

vi.mock('@/lib/session', () => ({
  requireApiSession: vi.fn(),
}))

vi.mock('@/lib/csrf', () => ({
  validateCsrf: vi.fn(),
}))

vi.mock('@/lib/audit-log', () => ({
  logAudit: vi.fn(),
}))

vi.mock('@/services/company.service', () => ({
  findOrCreateCompanyByName: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

import { prisma } from '@/lib/db'
import { requireApiSession } from '@/lib/session'
import { validateCsrf } from '@/lib/csrf'
import { createContactAction, updateContactAction, type ContactFormState } from '@/app/contacts/actions'

const mockFindFirst = vi.mocked(prisma.contact.findFirst)
const mockCreate = vi.mocked(prisma.contact.create)
const mockUpdate = vi.mocked(prisma.contact.update)
const mockRequireApiSession = vi.mocked(requireApiSession)
const mockValidateCsrf = vi.mocked(validateCsrf)

function formData(obj: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(obj)) fd.set(k, v)
  return fd
}

const mockSession = {
  user: {
    id: 'user-1',
    email: 'creator@test.com',
    name: 'Test Creator',
    organizationId: 'org-A',
    permissions: ['contacts.create', 'contacts.update'],
  },
}

const EXISTING = { id: 'c-existing', name: 'PRASHANT PATIL' }

beforeEach(() => {
  vi.clearAllMocks()
  mockRequireApiSession.mockResolvedValue(mockSession)
  mockValidateCsrf.mockResolvedValue(undefined)
})

describe('Contact email uniqueness (email-only rule)', () => {
  describe('createContactAction', () => {
    it('REJECTS: same email (a@x.com)', async () => {
      mockFindFirst.mockResolvedValue(EXISTING as never)
      const result = await createContactAction({} as ContactFormState, formData({
        name: 'New Contact',
        email: 'a@x.com',
        phone: '9876543210',
        mobile: '9123456789',
      }))
      expect(result.error).toContain('already exists')
      expect(result.error).toContain('PRASHANT PATIL')
      expect(mockCreate).not.toHaveBeenCalled()
    })

    it('REJECTS: same email "  A@X.com " (normalised: trim + lowercase)', async () => {
      mockFindFirst.mockResolvedValue(EXISTING as never)
      const result = await createContactAction({} as ContactFormState, formData({
        name: 'New Contact',
        email: '  A@X.com ',
        phone: '9876543210',
        mobile: '9123456789',
      }))
      expect(result.error).toContain('already exists')
      expect(mockCreate).not.toHaveBeenCalled()
    })

    it('REJECTS: same email "A@X.COM" (case-insensitive)', async () => {
      mockFindFirst.mockResolvedValue(EXISTING as never)
      const result = await createContactAction({} as ContactFormState, formData({
        name: 'New Contact',
        email: 'A@X.COM',
      }))
      expect(result.error).toContain('already exists')
      expect(mockCreate).not.toHaveBeenCalled()
    })

    it('ACCEPTS: different email, same phone and mobile', async () => {
      mockFindFirst.mockResolvedValue(null as never)
      mockCreate.mockResolvedValue({ id: 'c-new' } as never)
      const result = await createContactAction({} as ContactFormState, formData({
        name: 'New Contact',
        email: 'b@x.com',
        phone: '9876543210',
        mobile: '9123456789',
      }))
      expect(result.success).toBe(true)
      expect(result.createdId).toBe('c-new')
    })

    it('ACCEPTS: no email (empty string)', async () => {
      mockCreate.mockResolvedValue({ id: 'c-new' } as never)
      const result = await createContactAction({} as ContactFormState, formData({
        name: 'No Email Contact',
        email: '',
        phone: '123',
        mobile: '456',
      }))
      expect(result.success).toBe(true)
      expect(mockFindFirst).not.toHaveBeenCalled()
    })

    it('ACCEPTS: multiple email-less contacts (NULL keys never collide)', async () => {
      mockCreate.mockResolvedValue({ id: 'c-new' } as never)
      const result = await createContactAction({} as ContactFormState, formData({
        name: 'Another No Email',
        email: '',
      }))
      expect(result.success).toBe(true)
      expect(mockFindFirst).not.toHaveBeenCalled()
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ emailKey: null }) }),
      )
    })

    it('REJECTS: same email in same org (per-org unique, not global)', async () => {
      mockFindFirst.mockResolvedValue(EXISTING as never)
      const result = await createContactAction({} as ContactFormState, formData({
        name: 'Same Email',
        email: 'a@x.com',
      }))
      expect(result.error).toContain('already exists')
      expect(mockFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org-A' }) }),
      )
    })

    it('catches P2002 race: pre-check passes, create throws P2002', async () => {
      mockFindFirst.mockResolvedValueOnce(null as never)
      mockCreate.mockRejectedValueOnce({ code: 'P2002' } as never)
      mockFindFirst.mockResolvedValueOnce(EXISTING as never)

      const result = await createContactAction({} as ContactFormState, formData({
        name: 'New Contact',
        email: 'a@x.com',
      }))
      expect(result.error).toContain('already exists')
      expect(result.error).toContain('PRASHANT PATIL')
      expect(result.success).toBeUndefined()
    })

    it('does NOT store a contact when duplicate is detected', async () => {
      mockFindFirst.mockResolvedValue(EXISTING as never)
      const result = await createContactAction({} as ContactFormState, formData({
        name: 'New Contact',
        email: 'a@x.com',
      }))
      expect(result.error).toBeDefined()
      expect(mockCreate).not.toHaveBeenCalled()
    })

    it('does NOT lowercase or reformat the stored email value (only emailKey is normalised)', async () => {
      mockFindFirst.mockResolvedValue(null as never)
      mockCreate.mockResolvedValue({ id: 'c-new' } as never)
      await createContactAction({} as ContactFormState, formData({
        name: 'Contact A',
        email: '  A@X.com ',
      }))
      // The zod schema trims whitespace, but the casing is preserved in storage
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ email: 'A@X.com', emailKey: 'a@x.com' }) }),
      )
    })
  })

  describe('updateContactAction', () => {
    it('REJECTS: changing email to an existing email', async () => {
      mockFindFirst.mockResolvedValueOnce({ id: 'c-1', organizationId: 'org-A', ownerId: 'user-1' } as never)
      mockFindFirst.mockResolvedValueOnce(EXISTING as never)

      const result = await updateContactAction(
        'c-1',
        {} as ContactFormState,
        formData({ name: 'Updated', email: 'a@x.com' }),
      )
      expect(result.error).toContain('already exists')
      expect(result.error).toContain('PRASHANT PATIL')
      expect(mockUpdate).not.toHaveBeenCalled()
    })

    it('ACCEPTS: re-saving its own unchanged email (excludes self)', async () => {
      mockFindFirst.mockResolvedValueOnce({ id: 'c-1', organizationId: 'org-A', ownerId: 'user-1' } as never)
      mockFindFirst.mockResolvedValueOnce(null as never)
      mockUpdate.mockResolvedValue({} as never)

      const result = await updateContactAction(
        'c-1',
        {} as ContactFormState,
        formData({ name: 'Same Name', email: 'a@x.com' }),
      )
      expect(result.success).toBe(true)
      expect(mockUpdate).toHaveBeenCalled()
    })

    it('ACCEPTS: changing email to a new unique value', async () => {
      mockFindFirst.mockResolvedValueOnce({ id: 'c-1', organizationId: 'org-A', ownerId: 'user-1' } as never)
      mockFindFirst.mockResolvedValueOnce(null as never)
      mockUpdate.mockResolvedValue({} as never)

      const result = await updateContactAction(
        'c-1',
        {} as ContactFormState,
        formData({ name: 'Updated', email: 'new@x.com' }),
      )
      expect(result.success).toBe(true)
    })

    it('ACCEPTS: clearing the email (emailKey becomes null, never blocked)', async () => {
      mockFindFirst.mockResolvedValueOnce({ id: 'c-1', organizationId: 'org-A', ownerId: 'user-1' } as never)
      mockFindFirst.mockResolvedValueOnce(null as never)
      mockUpdate.mockResolvedValue({} as never)

      const result = await updateContactAction(
        'c-1',
        {} as ContactFormState,
        formData({ name: 'No Email', email: '' }),
      )
      expect(result.success).toBe(true)
    })
  })
})
