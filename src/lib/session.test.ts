import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock next/headers and next/navigation
vi.mock('next/headers', () => ({
  headers: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
}))

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}))

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getSession, requireSession, requireApiSession, requirePermission } from '@/lib/session'

const mockHeaders = vi.mocked(headers)
const mockRedirect = vi.mocked(redirect)
const mockAuthGetSession = vi.mocked(auth.api.getSession)

describe('session helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getSession', () => {
    it('calls auth.api.getSession with headers', async () => {
      const mockSession = { user: { id: 'user-1', email: 'test@example.com' } }
      mockHeaders.mockResolvedValue(new Headers())
      mockAuthGetSession.mockResolvedValue(mockSession)

      const session = await getSession()

      expect(mockHeaders).toHaveBeenCalled()
      expect(mockAuthGetSession).toHaveBeenCalledWith({ headers: expect.any(Headers) })
      expect(session).toEqual(mockSession)
    })

    it('returns null when no session exists', async () => {
      mockHeaders.mockResolvedValue(new Headers())
      mockAuthGetSession.mockResolvedValue(null)

      const session = await getSession()

      expect(session).toBeNull()
    })
  })

  describe('requireSession', () => {
    it('returns session when authenticated', async () => {
      const mockSession = { user: { id: 'user-1', email: 'test@example.com' } }
      mockHeaders.mockResolvedValue(new Headers())
      mockAuthGetSession.mockResolvedValue(mockSession)

      const session = await requireSession()

      expect(session).toEqual(mockSession)
      expect(mockRedirect).not.toHaveBeenCalled()
    })

    it('redirects to /login when not authenticated', async () => {
      mockHeaders.mockResolvedValue(new Headers())
      mockAuthGetSession.mockResolvedValue(null)

      await expect(requireSession()).rejects.toThrow() // redirect throws
      expect(mockRedirect).toHaveBeenCalledWith('/login')
    })
  })

  describe('requireApiSession', () => {
    it('returns session when authenticated', async () => {
      const mockSession = { user: { id: 'user-1', email: 'test@example.com' } }
      mockHeaders.mockResolvedValue(new Headers())
      mockAuthGetSession.mockResolvedValue(mockSession)

      const session = await requireApiSession()

      expect(session).toEqual(mockSession)
    })

    it('throws "Not authenticated" when no session', async () => {
      mockHeaders.mockResolvedValue(new Headers())
      mockAuthGetSession.mockResolvedValue(null)

      await expect(requireApiSession()).rejects.toThrow('Not authenticated')
    })
  })

  describe('requirePermission', () => {
    it('returns session when user has permission', async () => {
      const mockSession = {
        user: {
          id: 'user-1',
          email: 'test@example.com',
          permissions: ['users.view', 'users.create'],
        },
      }
      mockHeaders.mockResolvedValue(new Headers())
      mockAuthGetSession.mockResolvedValue(mockSession)

      const session = await requirePermission('users.view')

      expect(session).toEqual(mockSession)
      expect(mockRedirect).not.toHaveBeenCalled()
    })

    it('redirects with forbidden error when user lacks permission', async () => {
      const mockSession = {
        user: {
          id: 'user-1',
          email: 'test@example.com',
          permissions: ['users.view'],
        },
      }
      mockHeaders.mockResolvedValue(new Headers())
      mockAuthGetSession.mockResolvedValue(mockSession)

      await expect(requirePermission('users.delete')).rejects.toThrow()
      expect(mockRedirect).toHaveBeenCalledWith(
        expect.stringContaining('error=forbidden')
      )
    })

    it('redirects when no session', async () => {
      mockHeaders.mockResolvedValue(new Headers())
      mockAuthGetSession.mockResolvedValue(null)

      await expect(requirePermission('users.view')).rejects.toThrow()
      expect(mockRedirect).toHaveBeenCalledWith('/login')
    })
  })
})