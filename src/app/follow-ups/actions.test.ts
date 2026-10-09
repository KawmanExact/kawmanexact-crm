import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  prisma: {
    followUp: {
      create: vi.fn(),
      updateMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      deleteMany: vi.fn(),
    },
    deal: { findFirst: vi.fn(), update: vi.fn() },
    contact: { findFirst: vi.fn() },
    company: { findFirst: vi.fn() },
  },
}))

vi.mock('@/lib/session', () => ({
  requireApiSession: vi.fn(),
}))

vi.mock('@/lib/csrf', () => ({
  validateCsrf: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

import { prisma } from '@/lib/db'
import { requireApiSession } from '@/lib/session'
import { validateCsrf } from '@/lib/csrf'
import {
  createFollowUpAction,
  completeFollowUpAction,
  cancelFollowUpAction,
  deleteFollowUpAction,
} from '@/app/follow-ups/actions'
import type { Mock } from 'vitest'

const mockFollowUpCreate = vi.mocked(prisma.followUp.create)
const mockFollowUpUpdateMany = vi.mocked(prisma.followUp.updateMany)
const mockFollowUpFindUnique = vi.mocked(prisma.followUp.findUnique)
const mockFollowUpFindFirst = vi.mocked(prisma.followUp.findFirst)
const mockFollowUpDeleteMany = vi.mocked(prisma.followUp.deleteMany)
const mockDealFindFirst = vi.mocked(prisma.deal.findFirst)
const mockDealUpdate = vi.mocked(prisma.deal.update)
const mockContactFindFirst = vi.mocked(prisma.contact.findFirst)
const mockCompanyFindFirst = vi.mocked(prisma.company.findFirst)
const mockRequireApiSession = vi.mocked(requireApiSession)
const mockValidateCsrf = vi.mocked(validateCsrf)

const mockSession = {
  user: {
    id: 'user-1',
    email: 'creator@test.com',
    name: 'Test Creator',
    organizationId: 'org-A',
    permissions: ['leads.update'],
  },
}

function formData(obj: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(obj)) fd.set(k, v)
  return fd
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRequireApiSession.mockResolvedValue(mockSession)
  mockValidateCsrf.mockResolvedValue(undefined)
  mockFollowUpCreate.mockResolvedValue({ id: 'fu-1' } as never)
  mockFollowUpUpdateMany.mockResolvedValue({ count: 1 } as never)
  mockFollowUpDeleteMany.mockResolvedValue({ count: 1 } as never)
  mockDealUpdate.mockResolvedValue({} as never)
})

describe('createFollowUpAction — parent auto-fill', () => {
  it('derives contactId and companyId from the deal when dealId is provided', async () => {
    mockDealFindFirst.mockResolvedValue({
      id: 'deal-1',
      contactId: 'contact-1',
      companyId: 'company-1',
    } as never)
    // Cross-check: the contact must belong to the company from the deal
    mockContactFindFirst.mockResolvedValue({
      id: 'contact-1',
      companyId: 'company-1',
    } as never)
    mockFollowUpFindFirst.mockResolvedValue({ dueDate: new Date('2026-10-15T10:00') } as never)

    const result = await createFollowUpAction({} as never, formData({
      title: 'Test Follow-up',
      dueDate: '2026-10-15T10:00',
      priority: 'HIGH',
      dealId: 'deal-1',
      companyId: 'company-999',
      contactId: 'contact-999',
    }))

    expect(mockFollowUpCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          dealId: 'deal-1',
          contactId: 'contact-1',
          companyId: 'company-1',
        }),
      }),
    )
    expect(result).toEqual({})
  })

  it('derives companyId from the contact when contactId is provided', async () => {
    mockContactFindFirst.mockResolvedValue({
      id: 'contact-1',
      companyId: 'company-1',
    } as never)
    mockFollowUpFindFirst.mockResolvedValue({ dueDate: new Date('2026-10-15T10:00') } as never)

    await createFollowUpAction({} as never, formData({
      title: 'Test Follow-up',
      dueDate: '2026-10-15T10:00',
      contactId: 'contact-1',
    }))

    expect(mockFollowUpCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          contactId: 'contact-1',
          companyId: 'company-1',
          dealId: null,
        }),
      }),
    )
  })

  it('uses companyId as-is when only company is provided', async () => {
    mockCompanyFindFirst.mockResolvedValue({ id: 'company-1' } as never)
    mockFollowUpFindFirst.mockResolvedValue(null)

    await createFollowUpAction({} as never, formData({
      title: 'Test Follow-up',
      dueDate: '2026-10-15T10:00',
      companyId: 'company-1',
    }))

    expect(mockFollowUpCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          companyId: 'company-1',
          contactId: null,
          dealId: null,
        }),
      }),
    )
  })
})

describe('createFollowUpAction — cross-organization rejection', () => {
  it('rejects a dealId that belongs to another organization', async () => {
    mockDealFindFirst.mockResolvedValue(null)

    await expect(
      createFollowUpAction({} as never, formData({
        title: 'Test',
        dueDate: '2026-10-15T10:00',
        dealId: 'deal-other-org',
      })),
    ).rejects.toThrow('Deal not found or access denied')

    expect(mockFollowUpCreate).not.toHaveBeenCalled()
  })

  it('rejects a contactId that belongs to another organization', async () => {
    mockContactFindFirst.mockResolvedValue(null)

    await expect(
      createFollowUpAction({} as never, formData({
        title: 'Test',
        dueDate: '2026-10-15T10:00',
        contactId: 'contact-other-org',
      })),
    ).rejects.toThrow('Contact not found or access denied')

    expect(mockFollowUpCreate).not.toHaveBeenCalled()
  })

  it('rejects a companyId that belongs to another organization', async () => {
    mockCompanyFindFirst.mockResolvedValue(null)

    await expect(
      createFollowUpAction({} as never, formData({
        title: 'Test',
        dueDate: '2026-10-15T10:00',
        companyId: 'company-other-org',
      })),
    ).rejects.toThrow('Company not found or access denied')

    expect(mockFollowUpCreate).not.toHaveBeenCalled()
  })
})

describe('createFollowUpAction — contact/company mismatch rejection', () => {
  it('rejects when the deal links a contact that does not belong to the deal company', async () => {
    // Deal says: contact-1 belongs to company-1
    mockDealFindFirst.mockResolvedValue({
      id: 'deal-1',
      contactId: 'contact-1',
      companyId: 'company-1',
    } as never)
    // But the contact actually belongs to company-2
    mockContactFindFirst.mockResolvedValue({
      id: 'contact-1',
      companyId: 'company-2',
    } as never)

    await expect(
      createFollowUpAction({} as never, formData({
        title: 'Test',
        dueDate: '2026-10-15T10:00',
        dealId: 'deal-1',
      })),
    ).rejects.toThrow('Contact does not belong to the selected company')

    expect(mockFollowUpCreate).not.toHaveBeenCalled()
  })
})

describe('completeFollowUpAction — nextFollowUp recomputation', () => {
  it('sets Deal.nextFollowUp to null after completing the last pending follow-up', async () => {
    mockFollowUpFindUnique.mockResolvedValue({ dealId: 'deal-1' } as never)
    ;(mockFollowUpFindFirst as unknown as Mock).mockResolvedValueOnce(null)

    await completeFollowUpAction('fu-1')

    expect(mockFollowUpUpdateMany).toHaveBeenCalledWith({
      where: { id: 'fu-1', organizationId: 'org-A' },
      data: { status: 'COMPLETED', completedAt: expect.any(Date) },
    })
    expect(mockFollowUpFindUnique).toHaveBeenCalledWith({
      where: { id: 'fu-1', organizationId: 'org-A' },
      select: { dealId: true },
    })
    expect(mockFollowUpFindFirst).toHaveBeenCalledWith({
      where: { dealId: 'deal-1', organizationId: 'org-A', status: 'PENDING' },
      orderBy: { dueDate: 'asc' },
      select: { dueDate: true },
    })
    expect(mockDealUpdate).toHaveBeenCalledWith({
      where: { id: 'deal-1' },
      data: { nextFollowUp: null },
    })
  })

  it('recomputes Deal.nextFollowUp to the earliest remaining pending follow-up', async () => {
    mockFollowUpFindUnique.mockResolvedValue({ dealId: 'deal-1' } as never)
    const nextPendingDate = new Date('2026-10-25T10:00:00Z')
    ;(mockFollowUpFindFirst as unknown as Mock).mockResolvedValueOnce({ dueDate: nextPendingDate } as never)

    await completeFollowUpAction('fu-1')

    expect(mockDealUpdate).toHaveBeenCalledWith({
      where: { id: 'deal-1' },
      data: { nextFollowUp: nextPendingDate },
    })
  })

  it('does not recompute when the follow-up is from another organization', async () => {
    mockFollowUpUpdateMany.mockResolvedValue({ count: 0 } as never)

    await completeFollowUpAction('fu-other-org')

    expect(mockFollowUpFindUnique).not.toHaveBeenCalled()
    expect(mockDealUpdate).not.toHaveBeenCalled()
  })
})

describe('cancelFollowUpAction — nextFollowUp recomputation', () => {
  it('sets Deal.nextFollowUp to null after cancelling the last pending follow-up', async () => {
    mockFollowUpFindUnique.mockResolvedValue({ dealId: 'deal-1' } as never)
    ;(mockFollowUpFindFirst as unknown as Mock).mockResolvedValueOnce(null)

    await cancelFollowUpAction('fu-1')

    expect(mockFollowUpUpdateMany).toHaveBeenCalledWith({
      where: { id: 'fu-1', organizationId: 'org-A' },
      data: { status: 'CANCELLED' },
    })
    expect(mockDealUpdate).toHaveBeenCalledWith({
      where: { id: 'deal-1' },
      data: { nextFollowUp: null },
    })
  })
})

describe('deleteFollowUpAction — nextFollowUp recomputation', () => {
  it('sets Deal.nextFollowUp to null after deleting the last pending follow-up', async () => {
    mockFollowUpFindUnique.mockResolvedValue({ dealId: 'deal-1' } as never)
    ;(mockFollowUpFindFirst as unknown as Mock).mockResolvedValueOnce(null)

    await deleteFollowUpAction('fu-1')

    expect(mockFollowUpDeleteMany).toHaveBeenCalledWith({
      where: { id: 'fu-1', organizationId: 'org-A' },
    })
    expect(mockDealUpdate).toHaveBeenCalledWith({
      where: { id: 'deal-1' },
      data: { nextFollowUp: null },
    })
  })
})
