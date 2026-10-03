/**
 * Seeds a single-organization database.
 *
 * This app is single-tenant — only one Organization ever exists.
 * Self-serve org creation was removed (src/app/signup deleted in
 * refactor/single-org-and-fixes). Run this once on a fresh Neon DB
 * to create that one org + the first SUPER_ADMIN.
 *
 * Usage:
 *   1. Set env vars before running (or edit the PLACEHOLDERs below):
 *      SEED_ADMIN_EMAIL     — super-admin login email  (required in prod)
 *      SEED_ADMIN_PASSWORD  — super-admin password, ≥8 chars (required in prod)
 *      SEED_ADMIN_NAME      — display name (optional, defaults to "Admin")
 *      SEED_ORG_NAME        — organization name (optional, see ORG_NAME)
 *      SEED_ORG_SLUG        — org slug, URL-safe (optional, derived from name)
 *
 *   2. npm run db:seed   (runs `tsx prisma/seed.ts`)
 *
 * Safe to re-run: exits early if the org (by slug) already exists.
 * To reseed, delete the org row first or change SEED_ORG_SLUG.
 */
import { prisma } from '../src/lib/db'
import { ensureRolesAndPermissionsSeeded } from '../src/lib/rbac-seed'
import { hashPassword } from 'better-auth/crypto'

// ── Edit these placeholders before first production seed ──────────
// They are only used when the corresponding SEED_* env var is unset.
const ORG_NAME = process.env.SEED_ORG_NAME || 'My Company' // <-- EDIT ME
const ORG_SLUG = process.env.SEED_ORG_SLUG || slugify(ORG_NAME)

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'admin@example.com' // <-- EDIT ME (must be a real inbox if you want invite/reset emails)
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'ChangeMe123!' // <-- EDIT ME (≥8 chars, change immediately after first login)
const ADMIN_NAME = process.env.SEED_ADMIN_NAME || 'Admin'

function slugify(input: string): string {
  return input.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 60) || 'my-company'
}

async function main() {
  // Warn loudly if placeholders are still in use in production
  const usingPlaceholderEmail = !process.env.SEED_ADMIN_EMAIL
  const usingPlaceholderPassword = !process.env.SEED_ADMIN_PASSWORD
  const usingPlaceholderOrg = !process.env.SEED_ORG_NAME
  if (process.env.NODE_ENV === 'production' && (usingPlaceholderEmail || usingPlaceholderPassword)) {
    console.warn('[seed] WARNING: SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not set — using placeholders. Change the password immediately after first login.')
  }
  if (usingPlaceholderOrg) {
    console.warn(`[seed] Using placeholder org name "${ORG_NAME}" (set SEED_ORG_NAME to override).`)
  }

  const existing = await prisma.organization.findUnique({ where: { slug: ORG_SLUG } })
  if (existing) {
    console.log(`Organization "${existing.name}" already exists (slug: ${ORG_SLUG}). Skipping.`)
    console.log('Delete it first or change SEED_ORG_SLUG to reseed.')
    return
  }

  console.log('Seeding Permission/Role catalog...')
  await ensureRolesAndPermissionsSeeded()

  console.log(`Creating organization "${ORG_NAME}" (slug: ${ORG_SLUG})...`)
  const org = await prisma.organization.create({
    data: { name: ORG_NAME, slug: ORG_SLUG },
  })

  const department = await prisma.department.create({
    data: { name: 'General', organizationId: org.id },
  })
  const team = await prisma.team.create({
    data: { name: 'General', organizationId: org.id, departmentId: department.id },
  })

  console.log(`Creating SUPER_ADMIN ${ADMIN_EMAIL}...`)
  if (ADMIN_PASSWORD.length < 8) throw new Error('SEED_ADMIN_PASSWORD must be ≥8 characters')

  const passwordHash = await hashPassword(ADMIN_PASSWORD)

  const user = await prisma.user.create({
    data: {
      name: ADMIN_NAME,
      email: ADMIN_EMAIL,
      organizationId: org.id,
      departmentId: department.id,
      teamId: team.id,
      emailVerified: true,
      status: 'ACTIVE',
    },
  })
  await prisma.account.create({
    data: {
      userId: user.id,
      accountId: user.id,
      providerId: 'credential',
      issuer: 'local:credential',
      password: passwordHash,
    },
  })
  const superAdminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'SUPER_ADMIN' as never } })
  await prisma.userRole.create({ data: { userId: user.id, roleId: superAdminRole.id } })

  console.log('\nDone.\n')
  console.log(`Organization: ${org.name} (${org.slug})`)
  console.log(`Super admin:  ${ADMIN_EMAIL}`)
  if (usingPlaceholderPassword) console.log('Password:     (placeholder — ChangeMe123! — rotate immediately)')
  console.log('\nLog in at /login with the credentials above, then change the password in Settings → Profile.')
  if (usingPlaceholderEmail || usingPlaceholderPassword || usingPlaceholderOrg) {
    console.log('Placeholders were used — set SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD / SEED_ORG_NAME in your env before re-seeding a fresh DB.')
  }
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
