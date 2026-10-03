'use server'

import { validateCsrf } from '@/lib/csrf'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { auth } from '@/lib/auth'
import { ensureRolesAndPermissionsSeeded } from '@/lib/rbac-seed'
import { headers } from 'next/headers'
import { checkRateLimit } from '@/lib/rate-limit'
import { logAudit } from '@/lib/audit-log'

const signupSchema = z.object({
  organizationName: z.string().trim().min(2, 'Organization name is too short').max(120),
  name: z.string().trim().min(2, 'Your name is too short').max(120),
  email: z.string().trim().email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

export interface SuperadminState {
  success?: boolean
  error?: string
  fieldErrors?: Partial<Record<'organizationName' | 'name' | 'email' | 'password' | 'setupToken', string>>
}

// Generic error returned for ALL bootstrap-gate failures (org already exists,
// token missing/wrong, rate limited) so a random visitor cannot probe which
// condition triggered — they just see "Unable to complete setup."
const GENERIC_SETUP_ERROR = 'Unable to complete setup. Please check your details and try again.'

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60)
}

async function uniqueSlug(base: string): Promise<string> {
  const root = slugify(base) || 'workspace'
  let candidate = root
  let attempt = 0
  while (await prisma.organization.findUnique({ where: { slug: candidate }, select: { id: true } })) {
    attempt += 1
    candidate = `${root}-${attempt}`
  }
  return candidate
}

export async function superadminAction(_prevState: SuperadminState, formData: FormData): Promise<SuperadminState> {
  await validateCsrf()

  // ---- Rate limit: same as old /sign-up/email customRule (5 per 10 min) ----
  // Key by IP — Server Actions have no authenticated user yet.
  const headersList = await headers()
  const ip =
    headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    headersList.get('x-real-ip') ||
    headersList.get('x-vercel-forwarded-for') ||
    'unknown'
  const limit = await checkRateLimit(`superadmin:${ip}`, 5, 60 * 10)
  if (!limit.allowed) {
    return { error: GENERIC_SETUP_ERROR }
  }

  // ---- One-time bootstrap gate: must be first org, and must present token ----
  // Both failures return the SAME generic message so an outsider cannot
  // distinguish "token wrong" from "already bootstrapped".
  const expectedToken = process.env.SUPERADMIN_SETUP_TOKEN
  const providedToken = String(formData.get('setupToken') ?? '')

  // If no token is configured at all, treat as locked — don't create an org.
  if (!expectedToken) {
    return { error: GENERIC_SETUP_ERROR }
  }

  const orgCount = await prisma.organization.count()
  if (orgCount > 0) {
    return { error: GENERIC_SETUP_ERROR }
  }

  if (providedToken !== expectedToken) {
    return { error: GENERIC_SETUP_ERROR }
  }

  // ---- From here: original signup logic unchanged (org + user in one txn) ----
  const parsed = signupSchema.safeParse({
    organizationName: formData.get('organizationName'),
    name: formData.get('name'),
    email: formData.get('email'),
    password: formData.get('password'),
  })

  if (!parsed.success) {
    const fieldErrors: SuperadminState['fieldErrors'] = {}
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof NonNullable<SuperadminState['fieldErrors']>
      fieldErrors[key] = issue.message
    }
    return { fieldErrors }
  }

  const { organizationName, name, email, password } = parsed.data

  const existingUser = await prisma.user.findUnique({ where: { email }, select: { id: true } })
  if (existingUser) {
    return { fieldErrors: { email: 'An account with this email already exists' } }
  }

  await ensureRolesAndPermissionsSeeded()

  const slug = await uniqueSlug(organizationName)
  const organization = await prisma.organization.create({
    data: { name: organizationName, slug },
  })

  try {
    const { user: createdUser } = await auth.api.signUpEmail({
      body: {
        email,
        password,
        name,
        organizationId: organization.id,
      } as never,
      headers: await headers(),
    })

    const superAdminRole = await prisma.role.findUnique({ where: { name: 'SUPER_ADMIN' } })

    if (superAdminRole && createdUser) {
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: createdUser.id, roleId: superAdminRole.id } },
        update: {},
        create: { userId: createdUser.id, roleId: superAdminRole.id },
      })
    }

    // Permanent audit record of exactly when/how the org was bootstrapped.
    if (createdUser) {
      await logAudit({
        organizationId: organization.id,
        actorId: createdUser.id,
        action: 'CREATE',
        resource: 'Organization',
        resourceId: organization.id,
        metadata: { via: 'superadmin-bootstrap', slug: organization.slug, email },
      }).catch(() => {})
    }

    return { success: true }
  } catch (err) {
    await prisma.organization.delete({ where: { id: organization.id } }).catch(() => {})
    const message =
      err && typeof err === 'object' && 'body' in err
        ? ((err as { body?: { message?: string } }).body?.message ?? 'Could not create your account. Please try again.')
        : err instanceof Error
          ? err.message
          : 'Could not create your account. Please try again.'
    return { error: message }
  }
}
