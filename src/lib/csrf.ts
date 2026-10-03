import 'server-only'
import { headers } from 'next/headers'

/**
 * CSRF protection for Server Actions.
 *
 * Next.js Server Actions are POST endpoints that accept `multipart/form-data`
 * from the browser. They rely on the browser's same-origin cookie (SameSite).
 * This helper validates `Origin` matches `Host` — the cheapest effective
 * mitigation when an attacker tries to forge a cross-origin POST.
 *
 * Server Actions that mutate state MUST call this at the top. The check is
 * intentionally permissive when `Origin` is absent (same-origin navigations
 * from some browsers don't send it) but rejects any present `Origin` that
 * doesn't match `Host`.
 *
 * Usage:
 * ```ts
 * 'use server'
 * import { validateCsrf } from '@/lib/csrf'
 * import { requireApiSession } from '@/lib/session'
 *
 * export async function myAction(formData: FormData) {
 *   await validateCsrf()
 *   const session = await requireApiSession()
 *   // ...
 * }
 * ```
 */
export async function validateCsrf(): Promise<void> {
  const headersList = await headers()
  const origin = headersList.get('origin')
  const host = headersList.get('host')

  // No Origin header — typical for same-origin form POSTs from most browsers
  // and for Server Action invocations via fetch without CORS. Allow.
  if (!origin) return

  // In development, allow localhost origins (Next.js dev server may run on
  // a different port than the `Host` header's value during HMR).
  if (process.env.NODE_ENV === 'development') {
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) return
  }

  // Origin is present — it must match host (scheme-agnostic).
  if (host) {
    try {
      const originHost = new URL(origin).host
      if (originHost === host) return
    } catch {
      // Invalid URL — fall through to throw
    }
  }

  throw new Error('CSRF validation failed: Invalid origin')
}

/**
 * Get the allowed origins for CORS/CSRF validation.
 * Useful for configuring CORS in API routes.
 */
export function getAllowedOrigins(): string[] {
  const origins: string[] = []

  // Add the app's base URL
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.BETTER_AUTH_URL
  if (baseUrl) {
    origins.push(baseUrl)
  }

  // Add localhost for development
  if (process.env.NODE_ENV === 'development') {
    origins.push('http://localhost:3000', 'http://127.0.0.1:3000')
  }

  return origins
}
