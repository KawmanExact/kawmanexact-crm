import { describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'
import { proxy } from './proxy';


const SESSION_COOKIE = 'better-auth.session_token'

function req(pathname: string, opts: { withSession?: boolean; withToken?: boolean; headers?: Record<string, string> } = {}) {
  const headers = new Headers(opts.headers)
  if (opts.withSession) headers.set('cookie', `${SESSION_COOKIE}=valid-token`)
  if (opts.withToken) headers.set('authorization', 'Bearer test-token')
  return new NextRequest(`https://app.example.com${pathname}`, { headers })
}

function isRedirect(res: Response) {
  return res.status >= 300 && res.status < 400
}

function redirectLocation(res: Response) {
  return res.headers.get('location')
}

/** "Not treated as public" means the request is stopped: a redirect for a page
 *  route, or 401 JSON for an /api/ route. Either way it never reaches the
 *  handler as an anonymous caller. */
function isBlocked(res: Response) {
  return isRedirect(res) || res.status === 401
}

describe('proxy', () => {
  describe('public paths', () => {
    it.each([
      '/login',
      '/forgot-password',
      '/reset-password',
      '/superadmin',
      '/api/auth',
      '/api/auth/sign-in/email',
      '/api/health',
    ])('passes %s through without a session', (path) => {
      const res = proxy(req(path))
      expect(isRedirect(res)).toBe(false)
      expect(res.status).toBe(200)
    })
  })

  describe('prefix matching is exact-segment only', () => {
    // A naive startsWith('/api/auth') would wrongly open
    // /api/auth-bypass and /api/authorization to the public.
    it.each(['/api/auth-bypass', '/api/authorization', '/api/healthcheck', '/superadmin-tools'])(
      'does NOT treat %s as public',
      (path) => {
        const res = proxy(req(path))
        expect(isBlocked(res)).toBe(true)
      }
    )
  })

  describe('unauthenticated requests', () => {
    it.each(['/dashboard', '/admin/ai-analytics', '/leads', '/files/my-files', '/settings/profile'])(
      'redirects %s to /login',
      (path) => {
        const res = proxy(req(path))
        expect(isRedirect(res)).toBe(true)
        expect(redirectLocation(res)).toContain('/login')
      }
    )

    it('preserves the original path as callbackUrl', () => {
      const res = proxy(req('/leads/abc123'))
      const location = new URL(redirectLocation(res)!)
      expect(location.pathname).toBe('/login')
      expect(location.searchParams.get('callbackUrl')).toBe('/leads/abc123')
    })

    it('does not set callbackUrl for the root path', () => {
      const res = proxy(req('/'))
      const location = new URL(redirectLocation(res)!)
      expect(location.pathname).toBe('/login')
      expect(location.searchParams.has('callbackUrl')).toBe(false)
    })

    it('returns 401 JSON for API routes instead of an HTML redirect', async () => {
      const res = proxy(req('/api/leads/export'))
      expect(res.status).toBe(401)
      expect(res.headers.get('content-type')).toContain('application/json')
      await expect(res.json()).resolves.toEqual({ error: 'Not authenticated' })
    })
  })

  describe('requests carrying a session cookie', () => {
    it.each(['/dashboard', '/admin/ai-analytics', '/api/leads/export', '/leads'])(
      'lets %s continue to the route',
      (path) => {
        const res = proxy(req(path, { withSession: true }))
        expect(isRedirect(res)).toBe(false)
        expect(res.status).toBe(200)
      }
    )
  })

  describe('upload-signature endpoint is publicly accessible', () => {
    it('allows /api/mobile/upload-signature without auth', () => {
      const res = proxy(req('/api/mobile/upload-signature'))
      expect(isBlocked(res)).toBe(false)
    })
  })

  describe('bearer token (Kawman Field Android app)', () => {
    it('lets an /api/ request with an Authorization: Bearer header reach the route handler', () => {
      const res = proxy(req('/api/mobile/visits', { headers: { authorization: 'Bearer some.token.value' } }))
      expect(isBlocked(res)).toBe(false)
    })

    it('still blocks /api/ requests with no cookie and no bearer token', () => {
      expect(proxy(req('/api/mobile/visits')).status).toBe(401)
    })

    it('does not accept a bearer header as a session for page routes', () => {
      const res = proxy(req('/dashboard', { headers: { authorization: 'Bearer some.token.value' } }))
      expect(isRedirect(res)).toBe(true)
    })

    it('rejects an empty bearer value', () => {
      expect(proxy(req('/api/mobile/visits', { headers: { authorization: 'Bearer ' } })).status).toBe(401)
    })
  })
})
