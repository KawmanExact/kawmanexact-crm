import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

vi.mock('@/lib/mobile-api', () => ({
  mobileGuard: vi.fn(),
  badRequest: vi.fn((error: string, fieldErrors?: Record<string, string>) =>
    NextResponse.json({ error, fieldErrors }, { status: 400 }),
  ),
}))

vi.mock('@/lib/db', () => ({
  prisma: {
    devicePushToken: {
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}))

vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

import { mobileGuard } from '@/lib/mobile-api'
import { prisma } from '@/lib/db'

const mockMobileGuard = vi.mocked(mobileGuard)
const mockUpsert = vi.mocked(prisma.devicePushToken.upsert)
const mockDeleteMany = vi.mocked(prisma.devicePushToken.deleteMany)

const mockSession = {
  user: {
    id: 'user-1',
    email: 'sales@test.com',
    organizationId: 'org-A',
  },
}

const req = (method: string, body?: unknown) =>
  new Request('http://localhost/api/mobile/push-token', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })

beforeEach(() => {
  vi.clearAllMocks()
  mockMobileGuard.mockResolvedValue({ session: mockSession as never })
  mockUpsert.mockResolvedValue({} as never)
  mockDeleteMany.mockResolvedValue({ count: 1 } as never)
})

describe('POST /api/mobile/push-token', () => {
  it('returns 401 when unauthenticated', async () => {
    mockMobileGuard.mockResolvedValueOnce({ error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) })
    const { POST } = await import('@/app/api/mobile/push-token/route')
    const res = await POST(req('POST', { token: 'ExpoPushToken[abc]', platform: 'android' }))
    expect(res.status).toBe(401)
  })

  it('returns 403 when user lacks permission', async () => {
    mockMobileGuard.mockResolvedValueOnce({
      error: NextResponse.json({ error: 'You do not have permission to do this.' }, { status: 403 }),
    })
    const { POST } = await import('@/app/api/mobile/push-token/route')
    const res = await POST(req('POST', { token: 'ExpoPushToken[abc]', platform: 'android' }))
    expect(res.status).toBe(403)
  })

  it('validates token format — rejects non-Expo tokens', async () => {
    const { POST } = await import('@/app/api/mobile/push-token/route')
    const res = await POST(req('POST', { token: 'invalid-token', platform: 'android' }))
    expect(res.status).toBe(400)
  })

  it('validates platform', async () => {
    const { POST } = await import('@/app/api/mobile/push-token/route')
    const res = await POST(req('POST', { token: 'ExpoPushToken[abc]', platform: 'web' }))
    expect(res.status).toBe(400)
  })

  it('upserts token with session user/org, updates lastSeenAt', async () => {
    const { POST } = await import('@/app/api/mobile/push-token/route')
    await POST(req('POST', { token: 'ExpoPushToken[abc]', platform: 'android', deviceName: 'Pixel 7' }))
    expect(mockUpsert).toHaveBeenCalledWith({
      where: { token: 'ExpoPushToken[abc]' },
      update: expect.objectContaining({
        userId: 'user-1',
        organizationId: 'org-A',
        platform: 'android',
        lastSeenAt: expect.any(Date),
      }),
      create: expect.objectContaining({
        token: 'ExpoPushToken[abc]',
        userId: 'user-1',
        organizationId: 'org-A',
        platform: 'android',
      }),
    })
  })

  it('accepts Expo iOS tokens', async () => {
    const { POST } = await import('@/app/api/mobile/push-token/route')
    const res = await POST(req('POST', { token: 'ExponentPushToken[abc]', platform: 'ios' }))
    expect(res.status).toBe(200)
    expect(mockUpsert).toHaveBeenCalled()
  })
})

describe('DELETE /api/mobile/push-token', () => {
  it('returns 401 when unauthenticated', async () => {
    mockMobileGuard.mockResolvedValueOnce({ error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) })
    const { DELETE } = await import('@/app/api/mobile/push-token/route')
    const res = await DELETE(req('DELETE', { token: 'ExpoPushToken[abc]' }))
    expect(res.status).toBe(401)
  })

  it('only deletes tokens belonging to the session user', async () => {
    const { DELETE } = await import('@/app/api/mobile/push-token/route')
    await DELETE(req('DELETE', { token: 'ExpoPushToken[abc]' }))
    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: {
        token: 'ExpoPushToken[abc]',
        userId: 'user-1',
        organizationId: 'org-A',
      },
    })
  })

  it('validates token is provided', async () => {
    const { DELETE } = await import('@/app/api/mobile/push-token/route')
    const res = await DELETE(req('DELETE', {}))
    expect(res.status).toBe(400)
  })
})
