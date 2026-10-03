import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '@/lib/db'

vi.mock('@/lib/audit-log', () => ({
  logAudit: vi.fn(),
}))

const mockFindUnique = prisma.user.findUnique as ReturnType<typeof vi.fn>

import { sessionCreateBefore, sessionCreateAfter } from '@/lib/auth-hooks'
import { logAudit } from '@/lib/audit-log'

describe('sessionCreateBefore', () => {
  beforeEach(() => {
    mockFindUnique.mockReset()
  })

  it('allows ACTIVE users (returns undefined)', async () => {
    mockFindUnique.mockResolvedValue({ status: 'ACTIVE' })
    const result = await sessionCreateBefore({ userId: 'user-123' })
    expect(result).toBeUndefined()
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { id: 'user-123' },
      select: { status: true },
    })
  })

  it('blocks INACTIVE users (returns false)', async () => {
    mockFindUnique.mockResolvedValue({ status: 'INACTIVE' })
    const result = await sessionCreateBefore({ userId: 'user-123' })
    expect(result).toBe(false)
  })

  it('blocks SUSPENDED users (returns false)', async () => {
    mockFindUnique.mockResolvedValue({ status: 'SUSPENDED' })
    const result = await sessionCreateBefore({ userId: 'user-123' })
    expect(result).toBe(false)
  })

  it('blocks INVITED users (returns false)', async () => {
    mockFindUnique.mockResolvedValue({ status: 'INVITED' })
    const result = await sessionCreateBefore({ userId: 'user-123' })
    expect(result).toBe(false)
  })

  it('blocks when the user is missing from the DB (returns false)', async () => {
    mockFindUnique.mockResolvedValue(null)
    const result = await sessionCreateBefore({ userId: 'user-unknown' })
    expect(result).toBe(false)
  })

  it('blocks when session has no userId (returns false)', async () => {
    const result = await sessionCreateBefore({})
    expect(result).toBe(false)
    expect(mockFindUnique).not.toHaveBeenCalled()
  })
})

describe('sessionCreateAfter', () => {
  beforeEach(() => {
    mockFindUnique.mockReset()
    vi.mocked(logAudit).mockReset()
  })

  it('writes a LOGIN audit entry for an existing ACTIVE user', async () => {
    mockFindUnique.mockResolvedValue({ organizationId: 'org-1', status: 'ACTIVE' })
    vi.mocked(logAudit).mockResolvedValue()
    await sessionCreateAfter({ userId: 'user-123' })
    expect(logAudit).toHaveBeenCalledWith({
      organizationId: 'org-1',
      actorId: 'user-123',
      action: 'LOGIN',
      resource: 'session',
    })
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { id: 'user-123' },
      select: { organizationId: true },
    })
  })

  it('does nothing when userId is missing', async () => {
    await sessionCreateAfter({})
    expect(logAudit).not.toHaveBeenCalled()
  })

  it('does nothing when the user is not found', async () => {
    mockFindUnique.mockResolvedValue(null)
    await sessionCreateAfter({ userId: 'user-ghost' })
    expect(logAudit).not.toHaveBeenCalled()
  })

  it('catches logAudit errors without throwing', async () => {
    mockFindUnique.mockResolvedValue({ organizationId: 'org-1', status: 'ACTIVE' })
    vi.mocked(logAudit).mockRejectedValue(new Error('DB down'))
    await expect(sessionCreateAfter({ userId: 'user-123' })).resolves.not.toThrow()
  })
})
