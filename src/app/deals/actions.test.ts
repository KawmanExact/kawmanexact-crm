import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  prisma: {
    deal: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    activity: { create: vi.fn() },
    contact: { findFirst: vi.fn(), create: vi.fn() },
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

vi.mock('@/lib/record-scope', () => ({
  canManageAssignments: vi.fn(),
  contactOwnerScopeWhere: vi.fn(),
  ownerScopeWhere: vi.fn(),
}))

vi.mock('@/services/company.service', () => ({
  findOrCreateCompanyByName: vi.fn(),
}))

vi.mock('@/services/contact.service', () => ({
  findOrCreateContactByName: vi.fn(),
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
import { findOrCreateCompanyByName } from '@/services/company.service'
import { findOrCreateContactByName } from '@/services/contact.service'
import { createDealAction, updateDealAction, type DealFormState } from '@/app/deals/actions'

const mockDealCreate = vi.mocked(prisma.deal.create)
const mockDealFindFirst = vi.mocked(prisma.deal.findFirst)
const mockDealUpdate = vi.mocked(prisma.deal.update)
const mockContactCreate = vi.mocked(prisma.contact.create)
const mockActivityCreate = vi.mocked(prisma.activity.create)
const mockFindOrCreateContactByName = vi.mocked(findOrCreateContactByName)
const mockFindOrCreateCompanyByName = vi.mocked(findOrCreateCompanyByName)
const mockRequireApiSession = vi.mocked(requireApiSession)
const mockValidateCsrf = vi.mocked(validateCsrf)
const mockCanManageAssignments = vi.mocked(canManageAssignments)

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
    permissions: ['deals.create', 'deals.update'],
  },
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRequireApiSession.mockResolvedValue(mockSession)
  mockValidateCsrf.mockResolvedValue(undefined)
  mockCanManageAssignments.mockReturnValue(false)
  mockFindOrCreateCompanyByName.mockResolvedValue(null)
  mockActivityCreate.mockResolvedValue({ id: 'act-1' } as never)
  mockDealCreate.mockResolvedValue({
    id: 'deal-1',
    name: 'Test Deal',
    value: 1000,
    stage: 'NEW_LEAD',
  } as never)
  mockDealUpdate.mockResolvedValue({} as never)
})

describe('createDealAction', () => {
  it('creates a contact when the name does not match an existing one', async () => {
    mockFindOrCreateContactByName.mockResolvedValue({ id: 'contact-new', name: 'New Person' })

    const result = await createDealAction({} as DealFormState, formData({
      name: 'Test Deal',
      value: '1000',
      contactName: 'New Person',
      contactEmail: 'new@test.com',
      contactMobile: '+91 98765 43210',
    }))

    expect(mockFindOrCreateContactByName).toHaveBeenCalledWith({
      email: 'new@test.com',
      mobile: '+91 98765 43210',
      name: 'New Person',
      organizationId: 'org-A',
      ownerId: 'user-1',
      companyId: null,
    })
    expect(mockDealCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          contactId: 'contact-new',
        }),
      }),
    )
    expect(result.success).toBe(true)
  })

  it('links contactId when findOrCreateContactByName returns an existing contact', async () => {
    mockFindOrCreateContactByName.mockResolvedValue({ id: 'contact-123', name: 'Existing Contact' })

    await createDealAction({} as DealFormState, formData({
      name: 'Test Deal',
      value: '1000',
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
    expect(mockDealCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          contactId: 'contact-123',
        }),
      }),
    )
  })

  it('does not call findOrCreateContactByName when no contactName field is provided', async () => {
    await createDealAction({} as DealFormState, formData({
      name: 'Test Deal',
      value: '1000',
    }))

    expect(mockFindOrCreateContactByName).not.toHaveBeenCalled()
    expect(mockContactCreate).not.toHaveBeenCalled()
    expect(mockDealCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          contactId: null,
        }),
      }),
    )
  })
})

describe('updateDealAction', () => {
  beforeEach(() => {
    mockDealFindFirst.mockResolvedValue({
      id: 'deal-1',
      organizationId: 'org-A',
      ownerId: 'user-1',
      stage: 'NEW_LEAD',
      contactId: null,
    } as never)
  })

  it('creates/links contact when contactName is provided', async () => {
    mockFindOrCreateContactByName.mockResolvedValue({ id: 'contact-456', name: 'Linked Contact' })

    await updateDealAction('deal-1', {} as DealFormState, formData({
      name: 'Updated Deal',
      value: '2000',
      contactName: 'Linked Contact',
      contactEmail: 'linked@test.com',
    }))

    expect(mockFindOrCreateContactByName).toHaveBeenCalledWith({
      email: 'linked@test.com',
      mobile: null,
      name: 'Linked Contact',
      organizationId: 'org-A',
      ownerId: 'user-1',
      companyId: undefined,
    })
    expect(mockDealUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'deal-1' },
        data: expect.objectContaining({
          contactId: 'contact-456',
        }),
      }),
    )
  })

  it('preserves existing contactId when no contactName is provided', async () => {
    mockDealFindFirst.mockResolvedValue({
      id: 'deal-1',
      organizationId: 'org-A',
      ownerId: 'user-1',
      stage: 'NEW_LEAD',
      contactId: 'contact-preserve',
    } as never)

    await updateDealAction('deal-1', {} as DealFormState, formData({
      name: 'Updated Deal',
      value: '2000',
    }))

    expect(mockFindOrCreateContactByName).not.toHaveBeenCalled()
    expect(mockDealUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'deal-1' },
        data: expect.objectContaining({
          contactId: 'contact-preserve',
        }),
      }),
    )
  })
})
