import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  prisma: {
    fieldVisit: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    contact: { findFirst: vi.fn(), create: vi.fn() },
    checkIn: { create: vi.fn() },
    notification: { create: vi.fn() },
  },
}))

vi.mock('@/lib/session', () => ({
  requireApiSession: vi.fn(),
}))

vi.mock('@/lib/csrf', () => ({
  validateCsrf: vi.fn(),
}))

vi.mock('@/lib/record-scope', () => ({
  canManageAssignments: vi.fn(),
  contactOwnerScopeWhere: vi.fn(),
  ownerScopeWhere: vi.fn(),
}))

vi.mock('@/services/permission.service', () => ({
  getUserPermissions: vi.fn(),
}))

vi.mock('@/services/company.service', () => ({
  findOrCreateCompanyByName: vi.fn(),
}))

vi.mock('@/services/contact.service', () => ({
  findOrCreateContactByName: vi.fn(),
}))

vi.mock('@/services/field-visit.service', () => ({
  createCheckIn: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}))

import { prisma } from '@/lib/db'
import { requireApiSession } from '@/lib/session'
import { validateCsrf } from '@/lib/csrf'
import { canManageAssignments } from '@/lib/record-scope'
import { getUserPermissions } from '@/services/permission.service'
import { findOrCreateContactByName } from '@/services/contact.service'
import { findOrCreateCompanyByName } from '@/services/company.service'
import { createFieldVisitAction } from '@/app/field-sales/actions'

const mockFieldVisitCreate = vi.mocked(prisma.fieldVisit.create)
const mockContactCreate = vi.mocked(prisma.contact.create)
const mockFindOrCreateContactByName = vi.mocked(findOrCreateContactByName)
const mockFindOrCreateCompanyByName = vi.mocked(findOrCreateCompanyByName)
const mockRequireApiSession = vi.mocked(requireApiSession)
const mockValidateCsrf = vi.mocked(validateCsrf)
const mockCanManageAssignments = vi.mocked(canManageAssignments)
const mockGetUserPermissions = vi.mocked(getUserPermissions)

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
    permissions: ['field_visits.create', 'field_visits.update'],
  },
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRequireApiSession.mockResolvedValue(mockSession)
  mockValidateCsrf.mockResolvedValue(undefined)
  mockGetUserPermissions.mockResolvedValue(['field_visits.create', 'field_visits.update'])
  mockCanManageAssignments.mockReturnValue(false)
  mockFindOrCreateCompanyByName.mockResolvedValue(null)
  mockFieldVisitCreate.mockResolvedValue({
    id: 'visit-1',
    title: 'Test Visit',
    organizationId: 'org-A',
    assigneeId: 'user-1',
  } as never)
})

describe('createFieldVisitAction', () => {
  it('creates/links contact when contactName is provided', async () => {
    mockFindOrCreateContactByName.mockResolvedValue({ id: 'contact-789', name: 'New Contact' })

    await createFieldVisitAction({} as never, formData({
      title: 'Client Visit',
      purpose: 'Discuss Q4 pipeline',
      scheduledAt: '2026-10-15T10:00',
      contactName: 'New Contact',
      contactEmail: 'new@test.com',
      contactMobile: '+91 98765 43210',
    }))

    expect(mockFindOrCreateContactByName).toHaveBeenCalledWith({
      email: 'new@test.com',
      mobile: '+91 98765 43210',
      name: 'New Contact',
      organizationId: 'org-A',
      ownerId: 'user-1',
      companyId: null,
    })
    expect(mockFieldVisitCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          contactId: 'contact-789',
        }),
      }),
    )
  })

  it('links existing contactId when findOrCreateContactByName returns one', async () => {
    mockFindOrCreateContactByName.mockResolvedValue({ id: 'contact-789', name: 'Existing Contact' })

    await createFieldVisitAction({} as never, formData({
      title: 'Client Visit',
      purpose: 'Discuss Q4 pipeline',
      scheduledAt: '2026-10-15T10:00',
      contactName: 'Existing Contact',
    }))

    expect(mockFindOrCreateContactByName).toHaveBeenCalledWith({
      email: null,
      mobile: null,
      name: 'Existing Contact',
      organizationId: 'org-A',
      ownerId: 'user-1',
      companyId: null,
    })
    expect(mockFieldVisitCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          contactId: 'contact-789',
        }),
      }),
    )
  })

  it('does not call findOrCreateContactByName when no contactName is provided', async () => {
    await createFieldVisitAction({} as never, formData({
      title: 'Client Visit',
      purpose: 'Discuss Q4 pipeline',
      scheduledAt: '2026-10-15T10:00',
    }))

    expect(mockFindOrCreateContactByName).not.toHaveBeenCalled()
    expect(mockContactCreate).not.toHaveBeenCalled()
    expect(mockFieldVisitCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          contactId: null,
        }),
      }),
    )
  })
})
