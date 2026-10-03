import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/session', () => ({
  requireApiSession: vi.fn(),
}))

vi.mock('@/lib/cloudinary', () => ({
  isCloudinaryConfigured: vi.fn(),
  uploadToCloudinary: vi.fn(),
}))

vi.mock('@/services/file.service', () => ({
  createFileRecord: vi.fn(),
}))

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(),
}))

import { requireApiSession } from '@/lib/session'
import { isCloudinaryConfigured } from '@/lib/cloudinary'
import { checkRateLimit } from '@/lib/rate-limit'

const mockRequireApiSession = vi.mocked(requireApiSession)
const mockIsCloudinaryConfigured = vi.mocked(isCloudinaryConfigured)
const mockCheckRateLimit = vi.mocked(checkRateLimit)

describe('POST /api/files/upload', () => {
  const mockSession = {
    user: {
      id: 'user-1',
      email: 'test@example.com',
      name: 'Test User',
      organizationId: 'org-1',
      permissions: ['files.upload'],
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireApiSession.mockResolvedValue(mockSession)
    mockCheckRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0, remaining: 29 })
    mockIsCloudinaryConfigured.mockReturnValue(true)
  })

  it('returns 401 when not authenticated', async () => {
    mockRequireApiSession.mockRejectedValue(new Error('Not authenticated'))

    const { POST } = await import('@/app/api/files/upload/route')
    const response = await POST(new Request('http://localhost/api/files/upload', { method: 'POST' }))
    expect(response.status).toBe(401)
    const data = await response.json()
    expect(data.error).toBe('Not authenticated')
  })

  it('returns 403 when user lacks files.upload permission', async () => {
    mockRequireApiSession.mockResolvedValue({
      ...mockSession,
      user: { ...mockSession.user, permissions: [] },
    })

    const { POST } = await import('@/app/api/files/upload/route')
    const formData = new FormData()
    formData.append('file', new Blob(['test'], { type: 'text/plain' }), 'test.txt')
    const response = await POST(new Request('http://localhost/api/files/upload', { method: 'POST', body: formData }))
    expect(response.status).toBe(403)
    const data = await response.json()
    expect(data.error).toContain('permission to upload')
  })

  it('returns 429 when rate limited', async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 30, remaining: 0 })

    const { POST } = await import('@/app/api/files/upload/route')
    const formData = new FormData()
    formData.append('file', new Blob(['test'], { type: 'text/plain' }), 'test.txt')
    const response = await POST(new Request('http://localhost/api/files/upload', { method: 'POST', body: formData }))
    expect(response.status).toBe(429)
    const data = await response.json()
    expect(data.error).toContain('Too many uploads')
  })

  it('returns 503 when Cloudinary not configured', async () => {
    mockIsCloudinaryConfigured.mockReturnValue(false)

    const { POST } = await import('@/app/api/files/upload/route')
    const formData = new FormData()
    formData.append('file', new Blob(['test'], { type: 'text/plain' }), 'test.txt')
    const response = await POST(new Request('http://localhost/api/files/upload', { method: 'POST', body: formData }))
    expect(response.status).toBe(503)
    const data = await response.json()
    expect(data.error).toContain('Cloudinary is not configured')
  })
})