import 'server-only'
import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { nextCookies } from 'better-auth/next-js'
import { customSession } from 'better-auth/plugins/custom-session'
import { bearer } from 'better-auth/plugins/bearer'
import { prisma } from '@/lib/db'
import { getUserPermissions } from '@/services/permission.service'
import { sendPasswordResetEmail } from '@/lib/email'
import { zohoOAuthPlugins } from '@/lib/zoho-oauth'
import { sessionCreateBefore, sessionCreateAfter } from '@/lib/auth-hooks'
import { logger } from '@/lib/logger'

/**
 * Central auth instance. Everything server-side that needs to know
 * "who is logged in" goes through this — never trust client state.
 *
 * organizationId is an additional field on the User model that MUST be
 * supplied at signUp time (see app/(auth)/actions.ts, which creates the
 * Organization + first user together in one transaction). `input: true`
 * lets the signup call set it once; there is no update-profile endpoint
 * that touches it, so a logged-in user can never move themselves into a
 * different organization.
 */
export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_APP_URL,
  database: prismaAdapter(prisma, { provider: 'postgresql' }),

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    autoSignIn: true,
    resetPasswordTokenExpiresIn: 60 * 60, // 1 hour
    // Uses the SMTP-backed email service in lib/email.ts when
    // SMTP_HOST + SMTP_USER + SMTP_PASS + EMAIL_FROM are set; otherwise
    // falls back to logging the link server-side so the flow stays
    // testable in dev.
    sendResetPassword: async ({ user, url }) => {
      await sendPasswordResetEmail(user.email, url)
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // refresh once per day of activity
    cookieCache: { enabled: true, maxAge: 60 }, // 60s edge-cookie cache for middleware
  },

  // Better-Auth's built-in limiter, keyed by IP by default. Enabled in every
  // environment (not just production, which is the library default) since
  // the audit flagged auth endpoints as having no throttling at all.
  // Storage is in-memory, which is fine for a single instance; if this is
  // ever deployed with multiple server instances, set `storage:
  // "secondary-storage"` and wire up REDIS_URL so all instances share
  // counters (see `secondaryStorage` note below — omitted here since no
  // Redis client is currently connected for this purpose).
  rateLimit: {
    enabled: true,
    window: 60, // seconds
    max: 20, // generous default for the general auth surface
    customRules: {
      // Credential guessing / brute force — tightest limits.
      '/sign-in/email': { window: 60, max: 5 },
      '/sign-up/email': { window: 60 * 10, max: 5 },
      '/request-password-reset': { window: 60 * 10, max: 3 },
      '/reset-password': { window: 60 * 10, max: 5 },
    },
  },

  user: {
    additionalFields: {
      organizationId: { type: 'string', required: true, input: true },
      employeeId: { type: 'string', required: false, input: true },
      phone: { type: 'string', required: false, input: true },
      designation: { type: 'string', required: false, input: true },
    },
  },

  databaseHooks: {
    user: {
       create: {
        // Enforce company-domain users: reject signups whose email does not
        // end with @kawmanexact.com. Returning false aborts user creation.
        before: async (user) => {
          const email = (user as { email?: string }).email
          const domain = process.env.ALLOWED_EMAIL_DOMAIN || 'kawmanexact.com'
          if (!email || !email.endsWith(`@${domain}`)) return false
        },
      },
    },
    session: {
      create: {
        before: sessionCreateBefore,
        after: sessionCreateAfter,
      },
    },
  },

  plugins: [
    // Bearer plugin: enables token-based auth (Authorization: Bearer) for the
    // mobile app. The sign-in endpoint returns the session token in the
    // `set-auth-token` response header so the mobile client can store it
    // and send it back as a Bearer token. Cookie-based web auth is unaffected.
    bearer(),
    // Generic OAuth (Zoho) — only registered when ZOHO_CLIENT_ID +
    // ZOHO_CLIENT_SECRET are set; otherwise returns [] and the app behaves
    // exactly as before (password login only).
    ...zohoOAuthPlugins(),
    // Every session response (server AND client) is enriched here with the
    // caller's resolved org/department/team/roles/permissions, computed
    // fresh from the DB — never trust a client-cached permission list.
    customSession(async ({ user, session }) => {
      try {
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          include: {
            organization: { select: { id: true, name: true, slug: true } },
            department: { select: { id: true, name: true } },
            team: { select: { id: true, name: true } },
            roles: { include: { role: true } },
          },
        })

        const permissions = dbUser
          ? await getUserPermissions(dbUser.id, dbUser.organizationId)
          : []

        return {
          session,
          user: {
            ...user,
            organizationId: dbUser?.organizationId ?? '',
            organization: dbUser?.organization ?? null,
            department: dbUser?.department ?? null,
            team: dbUser?.team ?? null,
            status: dbUser?.status ?? 'ACTIVE',
            roles: dbUser?.roles.map((r) => r.role.name) ?? [],
            permissions,
          },
        }
      } catch (err) {
        logger.error('customSession Prisma error', {}, err as Error)
        return {
          session,
          user: {
            ...user,
            organizationId: (user as unknown as { organizationId?: string }).organizationId ?? '',
            organization: null,
            department: null,
            team: null,
            status: 'ACTIVE',
            roles: [],
            permissions: [],
          },
        }
      }
    }),
    // Lets the Android app (no cookie jar) authenticate with
    // `Authorization: Bearer <token>`. The token is returned in the
    // `set-auth-token` response header on sign-in.
    bearer(),
    nextCookies(), // must be registered last: applies Set-Cookie on Server Actions
  ],
})

export type Session = typeof auth.$Infer.Session & {
  user: {
    organizationId: string
    organization: { id: string; name: string; slug: string } | null
    department: { id: string; name: string } | null
    team: { id: string; name: string } | null
    status: string
    roles: string[]
    permissions: string[]
  }
}
