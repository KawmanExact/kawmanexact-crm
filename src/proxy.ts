import { NextResponse, type NextRequest } from 'next/server'
import { getSessionCookie } from 'better-auth/cookies'

/**
 * Defense in depth — this is a *backstop*, not the authorization layer.
 *
 * Every Server Action and Route Handler still does its own session/permission
 * check (see lib/session.ts and services/permission.service.ts). Proxy runs
 * before the route is resolved, so a future route that forgets its own check
 * fails closed here instead of rendering data to an anonymous visitor.
 *
 * What it deliberately does NOT do: check permissions. Permission data lives
 * in Postgres and is resolved per-request in lib/auth.ts's customSession plugin;
 * doing that at the proxy layer would mean a DB round trip on every asset
 * request. Role/permission enforcement stays in the route.
 */

/** Exact-match public paths. Matched with `=== p`, never `startsWith`.
 *  Signup has no page of its own — it posts to /api/auth, covered below. */
const PUBLIC_EXACT = ['/login', '/forgot-password', '/reset-password'] as const

/** Prefix-match public paths. `=== p || startsWith(p + '/')` so `/api/auth`
 *  never accidentally matches a sibling like `/api/auth-bypass`. */
const PUBLIC_PREFIXES = [
  '/superadmin',
  '/api/auth',
  '/api/health',
  '/api/mobile/upload-signature',
  '/_next',
  '/static',
] as const

function isPublicPath(pathname: string): boolean {
  if ((PUBLIC_EXACT as readonly string[]).includes(pathname)) return true
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

/**
 * Presence-only check: does the request even carry a session cookie? This is
 * a cheap, sync, DB-free gate used to bounce obviously-anonymous page
 * navigations to /login. It deliberately does not validate the cookie — a
 * forged cookie passes here and is then rejected by the real
 * `auth.api.getSession` check in the route.
 */
function hasSessionCookie(request: NextRequest): boolean {
  if (getSessionCookie(request) !== null) return true
  // Native clients (Kawman Field Android app) send a bearer token instead of
  // a cookie. Presence-only, exactly like the cookie check: the route's own
  // auth.api.getSession() call validates the token (better-auth `bearer`
  // plugin) and rejects forged values.
  return request.nextUrl.pathname.startsWith('/api/') && /^Bearer\s+\S+/i.test(request.headers.get('authorization') ?? '')
}

/**
 * Presence-only check for a Bearer token (mobile/API auth via the
 * better-auth bearer plugin). This only checks that an Authorization header
 * with a Bearer scheme exists — the token itself is validated later by
 * `auth.api.getSession` inside each route handler.
 */
function hasBearerToken(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization')
  return !!(authHeader && authHeader.startsWith('Bearer '))
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (isPublicPath(pathname)) {
    return NextResponse.next()
  }

  if (!hasSessionCookie(request) && !(pathname.startsWith('/api/') && hasBearerToken(request))) {
    // API routes get a 401 JSON body rather than a redirect to an HTML page,
    // so fetch()/SSE clients get a parseable response instead of HTML.
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    const url = new URL('/login', request.url)
    // Preserve where they were headed so login can bounce them back.
    if (pathname !== '/') url.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Run on every page route and every API route, but skip the internals:
     * - _next/static, _next/image  — hashed build assets
     * - favicon.ico, sitemap.xml, robots.txt — metadata files
     * Files with an extension (the trailing `\\.\\w+$` group) are left alone
     * so uploads and static files under public/ keep working.
     */
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.\\w+$).*)',
  ],
}
