import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({
  auth: {
    api: { getSession: vi.fn() },
    $Infer: { Session: {} as any },
  },
}))

vi.mock('@/lib/cloudinary', () => ({
  isCloudinaryConfigured: vi.fn(),
  getCloudinaryPublicConfig: vi.fn(),
  cloudinaryOrgFolder: vi.fn((orgId: string) => `kawman-exact/${orgId}`),
}))

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(),
}))

vi.mock('cloudinary', () => ({
  v2: {
    utils: { api_sign_request: vi.fn() },
    config: vi.fn(),
  },
}))

import { auth } from '@/lib/auth'
import { isCloudinaryConfigured, getCloudinaryPublicConfig } from '@/lib/cloudinary'
import { checkRateLimit, type RateLimitResult } from '@/lib/rate-limit'
import { v2 as cloudinary } from 'cloudinary'

const mockGetSession = vi.mocked(auth.api.getSession)
const mockIsCloudinaryConfigured = vi.mocked(isCloudinaryConfigured)
const mockGetCloudinaryPublicConfig = vi.mocked(getCloudinaryPublicConfig)
const mockCheckRateLimit = vi.mocked(checkRateLimit)
const mockApiSignRequest = vi.mocked(cloudinary.utils.api_sign_request)

const rateLimitResult: RateLimitResult = { allowed: true, retryAfterSeconds: 0, remaining: 9 }

describe('POST /api/cloudinary/sign', () => {
  const mockSession = {
    user: {
      id: 'user-1',
      email: 'test@example.com',
      name: 'Test User',
      organizationId: 'org-A',
      permissions: ['meetings.create', 'meetings.update'],
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('CLOUDINARY_API_SECRET', 'super-secret')
    vi.stubEnv('CLOUDINARY_CLOUD_NAME', 'my-cloud')
    vi.stubEnv('CLOUDINARY_API_KEY', '1234567890')
    mockGetSession.mockResolvedValue(mockSession as never)
    mockCheckRateLimit.mockResolvedValue(rateLimitResult)
    mockIsCloudinaryConfigured.mockReturnValue(true)
    mockGetCloudinaryPublicConfig.mockReturnValue({ cloudName: 'my-cloud', apiKey: '1234567890' })
    mockApiSignRequest.mockReturnValue('signed-signature')
  })

  it('returns 401 when not authenticated', async () => {
    mockGetSession.mockResolvedValue(null)

    const { POST } = await import('@/app/api/cloudinary/sign/route')
    const response = await POST(new Request('http://localhost/api/cloudinary/sign', { method: 'POST' }))
    expect(response.status).toBe(401)
    const data = await response.json()
    expect(data.error).toBe('Unauthorized')
  })

  it('returns 403 when the user lacks meetings.create and meetings.update', async () => {
    mockGetSession.mockResolvedValue({
      ...mockSession,
      user: { ...mockSession.user, permissions: [] },
    } as never)

    const { POST } = await import('@/app/api/cloudinary/sign/route')
    const response = await POST(new Request('http://localhost/api/cloudinary/sign', { method: 'POST' }))
    expect(response.status).toBe(403)
  })

  it('returns 429 when rate limited', async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 30, remaining: 0 })

    const { POST } = await import('@/app/api/cloudinary/sign/route')
    const response = await POST(new Request('http://localhost/api/cloudinary/sign', { method: 'POST' }))
    expect(response.status).toBe(429)
    const data = await response.json()
    expect(data.error).toContain('Too many')
  })

  it('returns 503 when Cloudinary is not configured', async () => {
    mockIsCloudinaryConfigured.mockReturnValue(false)

    const { POST } = await import('@/app/api/cloudinary/sign/route')
    const response = await POST(new Request('http://localhost/api/cloudinary/sign', { method: 'POST' }))
    expect(response.status).toBe(503)
  })

  it('returns signed upload params scoped to the session org folder', async () => {
    const { POST } = await import('@/app/api/cloudinary/sign/route')
    const response = await POST(new Request('http://localhost/api/cloudinary/sign', { method: 'POST' }))
    expect(response.status).toBe(200)
    const data = await response.json()

    expect(data.folder).toBe('kawman-exact/org-A')
    expect(data.apiKey).toBe('1234567890')
    expect(data.cloudName).toBe('my-cloud')
    expect(typeof data.timestamp).toBe('number')
    expect(data.signature).toBe('signed-signature')

    expect(mockApiSignRequest).toHaveBeenCalledWith(
      expect.objectContaining({ folder: 'kawman-exact/org-A' }),
      'super-secret'
    )
    // The API secret must never be sent to the client.
    expect(data).not.toHaveProperty('apiSecret')
    expect(data).not.toHaveProperty('api_secret')
  })

  it('never leaks the API secret in the response body', async () => {
    const { POST } = await import('@/app/api/cloudinary/sign/route')
    const response = await POST(new Request('http://localhost/api/cloudinary/sign', { method: 'POST' }))
    const text = await response.text()
    expect(text).not.toContain('super-secret')
  })

  it('derives the upload folder from the session, ignoring any client-supplied org', async () => {
    const { POST } = await import('@/app/api/cloudinary/sign/route')
    const response = await POST(
      new Request('http://localhost/api/cloudinary/sign', {
        method: 'POST',
        body: JSON.stringify({ organizationId: 'evil-org' }),
      })
    )
    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.folder).toBe('kawman-exact/org-A')
  })
})
