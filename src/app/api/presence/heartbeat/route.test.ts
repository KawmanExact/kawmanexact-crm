import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  prisma: {
    session: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}))

vi.mock('@/lib/session', () => ({
  requireApiSession: vi.fn(),
}))

import { prisma } from '@/lib/db'
import { requireApiSession } from '@/lib/session'

const mockPrisma = vi.mocked(prisma)
const mockRequireApiSession = vi.mocked(requireApiSession)

describe('POST /api/presence/heartbeat', () => {
  const mockSession = {
    user: { id: 'user-1', email: 'test@example.com', name: 'Test User' },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireApiSession.mockResolvedValue(mockSession)
  })

  it('returns 401 when not authenticated', async () => {
    mockRequireApiSession.mockRejectedValue(new Error('Not authenticated'))

    const { POST } = await import('@/app/api/presence/heartbeat/route')
    const response = await POST()
    expect(response.status).toBe(401)
    const data = await response.json()
    expect(data.error).toBe('Not authenticated')
  })

  it('updates session lastSeenAt and returns ok', async () => {
    const now = new Date()
    vi.useFakeTimers()
    vi.setSystemTime(now)

    mockPrisma.session.findFirst.mockResolvedValue({ id: 'session-1' })
    mockPrisma.session.update.mockResolvedValue({})

    const { POST } = await import('@/app/api/presence/heartbeat/route')
    const response = await POST()

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.ok).toBe(true)
    expect(data.lastSeenAt).toBe(now.toISOString())
    expect(mockPrisma.session.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: { lastSeenAt: now, updatedAt: now },
    })

    vi.useRealTimers()
  })

  it('returns ok even when no session found', async () => {
    const now = new Date()
    vi.useFakeTimers()
    vi.setSystemTime(now)

    mockPrisma.session.findFirst.mockResolvedValue(null)

    const { POST } = await import('@/app/api/presence/heartbeat/route')
    const response = await POST()

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.ok).toBe(true)
    expect(data.lastSeenAt).toBe(now.toISOString())
    expect(mockPrisma.session.update).not.toHaveBeenCalled()

    vi.useRealTimers()
  })
})