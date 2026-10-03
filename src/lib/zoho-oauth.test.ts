import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { mapZohoUserInfo } from '@/lib/zoho-oauth'

describe('mapZohoUserInfo', () => {
  beforeEach(() => {
    vi.stubEnv('ALLOWED_EMAIL_DOMAIN', 'kawmanexact.com')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('maps a valid company email — lowercase, id from ZUID, name from Display_Name', () => {
    const raw = {
      ZUID: '12345zb',
      Email: 'John.Doe@kawmanexact.com',
      Display_Name: 'John Doe',
      First_Name: 'John',
      Last_Name: 'Doe',
    }
    const result = mapZohoUserInfo(raw, 'kawmanexact.com')
    expect(result).toEqual({
      id: '12345zb',
      email: 'john.doe@kawmanexact.com',
      emailVerified: true,
      name: 'John Doe',
    })
  })

  it('rejects emails not on the allowed domain', () => {
    const raw = { ZUID: '123', Email: 'user@example.com', Display_Name: 'Test' }
    expect(mapZohoUserInfo(raw, 'kawmanexact.com')).toBeNull()
  })

  it('falls back to First_Name when Display_Name is missing', () => {
    const raw = { ZUID: '123', Email: 'user@kawmanexact.com', First_Name: 'Jane' }
    const result = mapZohoUserInfo(raw, 'kawmanexact.com')
    expect(result).toEqual({
      id: '123',
      email: 'user@kawmanexact.com',
      emailVerified: true,
      name: 'Jane',
    })
  })

  it('handles empty or missing Email', () => {
    expect(mapZohoUserInfo({ ZUID: '1' }, 'kawmanexact.com')).toBeNull()
    expect(mapZohoUserInfo({ ZUID: '1', Email: '' }, 'kawmanexact.com')).toBeNull()
  })

  it('lower-cases already-lowercase emails (idempotent)', () => {
    const raw = { ZUID: '1', Email: 'user@kawmanexact.com', Display_Name: 'User' }
    const result = mapZohoUserInfo(raw, 'kawmanexact.com')
    expect(result?.email).toBe('user@kawmanexact.com')
  })

  it('respects a custom allowed domain', () => {
    const raw = { ZUID: '1', Email: 'user@custom.com', Display_Name: 'Custom' }
    expect(mapZohoUserInfo(raw, 'custom.com')).toEqual({
      id: '1',
      email: 'user@custom.com',
      emailVerified: true,
      name: 'Custom',
    })
  })

  it('rejects domain-substring mismatch (e.g. @kawmanexact.com.evil.com)', () => {
    const raw = { ZUID: '1', Email: 'user@kawmanexact.com.evil.com', Display_Name: 'Evil' }
    expect(mapZohoUserInfo(raw, 'kawmanexact.com')).toBeNull()
  })
})

describe('buildZohoOAuthConfig — getUserInfo', () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
    vi.stubEnv('ZOHO_CLIENT_ID', 'test-id')
    vi.stubEnv('ZOHO_CLIENT_SECRET', 'test-secret')
    vi.stubEnv('ZOHO_ACCOUNTS_URL', 'https://accounts.zoho.in')
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.unstubAllEnvs()
  })

  it('returns null when no access token', async () => {
    const { buildZohoOAuthConfig } = await import('@/lib/zoho-oauth')
    const config = buildZohoOAuthConfig()
    expect(config).not.toBeNull()
    const result = await config!.getUserInfo!({} as any)
    expect(result).toBeNull()
  })

  it('fetches user info with Zoho-oauthtoken header and maps the result', async () => {
    vi.stubEnv('ZOHO_CLIENT_ID', 'test-id')
    vi.stubEnv('ZOHO_CLIENT_SECRET', 'test-secret')
    vi.stubEnv('ZOHO_ACCOUNTS_URL', 'https://accounts.zoho.in')

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ZUID: '99xb',
        Email: 'Jane@kawmanexact.com',
        Display_Name: 'Jane Doe',
      }),
    }) as any

    const { buildZohoOAuthConfig } = await import('@/lib/zoho-oauth')
    const config = buildZohoOAuthConfig()!
    const result = await config.getUserInfo!({ accessToken: 'zoho-access-token' } as any)

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://accounts.zoho.in/oauth/user/info',
      expect.objectContaining({
        method: 'GET',
        headers: { Authorization: 'Zoho-oauthtoken zoho-access-token' },
      }),
    )
    expect(result).toEqual({
      id: '99xb',
      email: 'jane@kawmanexact.com',
      emailVerified: true,
      name: 'Jane Doe',
    })
  })

  it('returns null when the email domain is not allowed', async () => {
    vi.stubEnv('ZOHO_CLIENT_ID', 'test-id')
    vi.stubEnv('ZOHO_CLIENT_SECRET', 'test-secret')

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ZUID: '99xb',
        Email: 'user@example.com',
        Display_Name: 'External User',
      }),
    }) as any

    const { buildZohoOAuthConfig } = await import('@/lib/zoho-oauth')
    const config = buildZohoOAuthConfig()!
    const result = await config.getUserInfo!({ accessToken: 'token' } as any)
    expect(result).toBeNull()
  })

  it('returns null when the fetch response is not OK', async () => {
    vi.stubEnv('ZOHO_CLIENT_ID', 'test-id')
    vi.stubEnv('ZOHO_CLIENT_SECRET', 'test-secret')

    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401 }) as any

    const { buildZohoOAuthConfig } = await import('@/lib/zoho-oauth')
    const config = buildZohoOAuthConfig()!
    const result = await config.getUserInfo!({ accessToken: 'bad-token' } as any)
    expect(result).toBeNull()
  })

  it('returns null (no plugin) when ZOHO_CLIENT_ID is unset', async () => {
    vi.stubEnv('ZOHO_CLIENT_ID', '')
    vi.stubEnv('ZOHO_CLIENT_SECRET', '')
    const { buildZohoOAuthConfig } = await import('@/lib/zoho-oauth')
    expect(buildZohoOAuthConfig()).toBeNull()
  })
})
