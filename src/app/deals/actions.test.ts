import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  prisma: {
    deal: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    dealItem: { createMany: vi.fn(), deleteMany: vi.fn() },
    product: { findMany: vi.fn(), count: vi.fn() },
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
import { createDealAction, updateDealAction, getDealLineItemOptions, type DealFormState } from '@/app/deals/actions'

const mockDealCreate = vi.mocked(prisma.deal.create)
const mockDealFindFirst = vi.mocked(prisma.deal.findFirst)
const mockDealUpdate = vi.mocked(prisma.deal.update)
const mockDealItemCreateMany = vi.mocked(prisma.dealItem.createMany)
const mockDealItemDeleteMany = vi.mocked(prisma.dealItem.deleteMany)
const mockProductFindMany = vi.mocked(prisma.product.findMany)
const mockProductCount = vi.mocked(prisma.product.count)
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
    stage: 'SUSPECT',
  } as never)
  mockDealUpdate.mockResolvedValue({} as never)
  mockProductCount.mockResolvedValue(0)
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
      stage: 'SUSPECT',
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
      stage: 'SUSPECT',
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

  it('replaces line items and recomputes value from the lines', async () => {
    await updateDealAction(
      'deal-1',
      {} as DealFormState,
      formData({
        name: 'Updated Deal',
        value: '2000',
        lineItems: JSON.stringify([
          { productId: 'prod-1', quantity: '2', unitPrice: '100', unitCost: '40' },
          { productId: 'prod-2', quantity: '5', unitPrice: '10', unitCost: '3' },
        ]),
      })
    )

    expect(mockDealItemDeleteMany).toHaveBeenCalledWith({
      where: { dealId: 'deal-1', organizationId: 'org-A' },
    })
    expect(mockDealItemCreateMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ dealId: 'deal-1', productId: 'prod-1', organizationId: 'org-A' }),
        expect.objectContaining({ dealId: 'deal-1', productId: 'prod-2', organizationId: 'org-A' }),
      ]),
    })
    // 2*100 + 5*10 = 250
    expect(mockDealUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'deal-1' },
        data: expect.objectContaining({ value: 250 }),
      }),
    )
  })
})

describe('createDealAction with line items', () => {
  it('computes deal value from line items and creates them', async () => {
    const result = await createDealAction(
      {} as DealFormState,
      formData({
        name: 'Test Deal',
        value: '1000',
        lineItems: JSON.stringify([
          { productId: 'prod-1', quantity: '3', unitPrice: '1000', unitCost: '400' },
        ]),
      })
    )

    expect(result.success).toBe(true)
    // 3 * 1000 = 3000, overriding the submitted 1000
    expect(mockDealCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ value: 3000 }),
      }),
    )
    expect(mockDealItemCreateMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          dealId: 'deal-1',
          productId: 'prod-1',
          organizationId: 'org-A',
          quantity: expect.any(Object),
          unitPrice: expect.any(Object),
          unitCost: expect.any(Object),
        }),
      ]),
    })
  })

  it('falls back to the submitted value when there are no line items', async () => {
    await createDealAction(
      {} as DealFormState,
      formData({ name: 'Test Deal', value: '12500' })
    )

    expect(mockDealItemCreateMany).not.toHaveBeenCalled()
    expect(mockDealCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ value: 12500 }),
      }),
    )
  })
})

describe('getDealLineItemOptions', () => {
  it('returns active products scoped to the org, mapped to option shape', async () => {
    mockProductFindMany.mockResolvedValue([
      { id: 'p1', name: 'AlphaExAct', variant: '1% WD', unit: 'kg', defaultUnitPrice: 1200, unitPrice: 1100, unitCost: 500 },
      { id: 'p2', name: 'BetaPure', variant: null, unit: 'kg', defaultUnitPrice: null, unitPrice: 300, unitCost: 120 },
    ] as never)

    const options = await getDealLineItemOptions()

    expect(mockProductFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 'org-A', isActive: true },
      }),
    )
    expect(options).toEqual([
      { id: 'p1', label: 'AlphaExAct - 1% WD', unit: 'kg', defaultUnitPrice: 1200, unitPrice: 1100, unitCost: 500 },
      { id: 'p2', label: 'BetaPure', unit: 'kg', defaultUnitPrice: null, unitPrice: 300, unitCost: 120 },
    ])
  })
})
