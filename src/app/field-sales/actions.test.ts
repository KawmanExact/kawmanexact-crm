import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  prisma: {
    fieldVisit: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    contact: { findFirst: vi.fn(), create: vi.fn() },
    checkIn: { create: vi.fn() },
    notification: { create: vi.fn() },
    devicePushToken: { findMany: vi.fn(), delete: vi.fn() },
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
  appendVisitReportToDailyReport: vi.fn(),
}))

vi.mock('@/services/push.service', () => ({
  sendPushToUser: vi.fn(),
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
import { createFieldVisitAction, updateFieldVisitAction } from '@/app/field-sales/actions'
import { sendPushToUser } from '@/services/push.service'

const mockFieldVisitCreate = vi.mocked(prisma.fieldVisit.create)
const mockFieldVisitFindFirst = vi.mocked(prisma.fieldVisit.findFirst)
const mockFieldVisitUpdate = vi.mocked(prisma.fieldVisit.update)
const mockContactCreate = vi.mocked(prisma.contact.create)
const mockFindOrCreateContactByName = vi.mocked(findOrCreateContactByName)
const mockFindOrCreateCompanyByName = vi.mocked(findOrCreateCompanyByName)
const mockRequireApiSession = vi.mocked(requireApiSession)
const mockValidateCsrf = vi.mocked(validateCsrf)
const mockCanManageAssignments = vi.mocked(canManageAssignments)
const mockGetUserPermissions = vi.mocked(getUserPermissions)
const mockNotificationCreate = vi.mocked(prisma.notification.create)
const mockSendPushToUser = vi.mocked(sendPushToUser)

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
      email2: null,
      mobile: '+91 98765 43210',
      mobile2: null,
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
      email2: null,
      mobile: null,
      mobile2: null,
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

  it('sends push notification when visit is assigned to a different user', async () => {
    mockCanManageAssignments.mockReturnValue(true)
    mockFieldVisitCreate.mockResolvedValue({
      id: 'visit-1',
      title: 'Test Visit',
      organizationId: 'org-A',
      assigneeId: 'user-2',
      scheduledAt: new Date('2026-10-15T10:00:00Z'),
    } as never)
    mockNotificationCreate.mockResolvedValue({ id: 'notif-1' } as never)

    await createFieldVisitAction({} as never, formData({
      title: 'Client Visit',
      purpose: 'Discuss Q4 pipeline',
      scheduledAt: '2026-10-15T10:00',
      assigneeId: 'user-2',
    }))

    expect(mockNotificationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'VISIT_ASSIGNED',
          userId: 'user-2',
        }),
      }),
    )
    expect(mockSendPushToUser).toHaveBeenCalledTimes(1)
    expect(mockSendPushToUser).toHaveBeenCalledWith(
      'user-2',
      'org-A',
      expect.objectContaining({
        title: 'New visit assigned',
        data: expect.objectContaining({
          type: 'VISIT_ASSIGNED',
          visitId: 'visit-1',
        }),
      }),
    )
  })

  it('does not send push notification on self-assignment', async () => {
    mockCanManageAssignments.mockReturnValue(true)
    mockFieldVisitCreate.mockResolvedValue({
      id: 'visit-1',
      title: 'Test Visit',
      organizationId: 'org-A',
      assigneeId: 'user-1',
      scheduledAt: new Date('2026-10-15T10:00:00Z'),
    } as never)

    await createFieldVisitAction({} as never, formData({
      title: 'Client Visit',
      purpose: 'Discuss Q4 pipeline',
      scheduledAt: '2026-10-15T10:00',
      assigneeId: 'user-1',
    }))

    expect(mockNotificationCreate).not.toHaveBeenCalled()
    expect(mockSendPushToUser).not.toHaveBeenCalled()
  })

  it('fire-and-forget push does not fail the assignment on error', async () => {
    mockCanManageAssignments.mockReturnValue(true)
    mockFieldVisitCreate.mockResolvedValue({
      id: 'visit-1',
      title: 'Test Visit',
      organizationId: 'org-A',
      assigneeId: 'user-2',
      scheduledAt: new Date('2026-10-15T10:00:00Z'),
    } as never)
    mockNotificationCreate.mockResolvedValue({ id: 'notif-1' } as never)
    mockSendPushToUser.mockRejectedValueOnce(new Error('Push failed'))

    await expect(createFieldVisitAction({} as never, formData({
      title: 'Client Visit',
      purpose: 'Discuss Q4 pipeline',
      scheduledAt: '2026-10-15T10:00',
      assigneeId: 'user-2',
    }))).resolves.not.toThrow()
  })
})

describe('updateFieldVisitAction', () => {
  it('returns an error when the visit id is missing', async () => {
    const result = await updateFieldVisitAction({} as never, formData({
      title: 'Client Visit',
      purpose: 'Discuss Q4 pipeline',
      scheduledAt: '2026-10-15T10:00',
    }))
    expect(result.error).toBe('Missing visit id.')
  })

  it('returns an error when the visit does not exist', async () => {
    mockFieldVisitFindFirst.mockResolvedValue(null)
    const result = await updateFieldVisitAction({} as never, formData({
      id: 'visit-missing',
      title: 'Client Visit',
      purpose: 'Discuss Q4 pipeline',
      scheduledAt: '2026-10-15T10:00',
    }))
    expect(result.error).toBe('Visit not found.')
    expect(mockFieldVisitUpdate).not.toHaveBeenCalled()
  })

  it('updates a visit, preserving the assignee when the user cannot reassign', async () => {
    mockCanManageAssignments.mockReturnValue(false)
    mockFieldVisitFindFirst.mockResolvedValue({
      id: 'visit-1',
      organizationId: 'org-A',
      assigneeId: 'user-2',
      companyId: null,
      contactId: null,
      latitude: null,
      longitude: null,
    } as never)
    mockFieldVisitUpdate.mockResolvedValue({} as never)

    await updateFieldVisitAction({} as never, formData({
      id: 'visit-1',
      title: 'Client Visit',
      purpose: 'Discuss Q4 pipeline',
      scheduledAt: '2026-10-15T10:00',
      company: '',
      contactName: '',
    }))

    expect(mockFieldVisitUpdate).toHaveBeenCalledWith({
      where: { id: 'visit-1' },
      data: expect.objectContaining({
        title: 'Client Visit',
        purpose: 'Discuss Q4 pipeline',
        scheduledAt: new Date('2026-10-15T10:00'),
        assigneeId: 'user-2',
        companyId: null,
        contactId: null,
      }),
    })
  })
})
