/**
 * Clean up Contact rows whose `name` was populated with a phone number.
 *
 * Before the `findOrCreateContactByName` phone-number safeguard was in place,
 * phone numbers could be silently stored as a Contact's display `name`. This
 * script migrates those rows by moving the phone number into the `mobile`
 * field and replacing `name` with a placeholder ("Contact") so the UI no longer
 * displays a phone number as the contact's name.
 *
 * Behaviour:
 *   1. SELECT all contacts whose `name` matches the phone-number pattern.
 *   2. PRINT a summary (count + each contact's id, name, mobile, email, org, createdAt).
 *   3. For each row:
 *        - If `mobile` is null/empty: move `name` → `mobile`.
 *        - If `mobile` already has a value: leave `mobile` unchanged (we never
 *          overwrite existing data); a warning is printed.
 *        - Set `name` = "Contact".
 *   4. Updates are skipped unless --dry-run is NOT passed.
 *
 * Flags:
 *   --dry-run   Show what would change without writing anything.
 *
 * Usage:
 *   npx tsx prisma/scripts/cleanup-phone-named-contacts.ts --dry-run
 *   npx tsx prisma/scripts/cleanup-phone-number-as-name.ts
 *   npm run db:cleanup-phone-names -- --dry-run
 */
import { prisma } from '../../src/lib/db'
import { looksLikePhoneNumber } from '../../src/services/contact.service'

const BATCH_SIZE = 500

async function main() {
  const dryRun = process.argv.includes('--dry-run')

  console.log(`[cleanup] scanning contacts for phone-number names${dryRun ? ' (DRY RUN — no writes)' : ''}...`)

  const contacts = await prisma.contact.findMany({
    where: {},
    select: {
      id: true,
      name: true,
      mobile: true,
      email: true,
      organizationId: true,
      ownerId: true,
      createdAt: true,
    },
  })

  const phoneNamed = contacts.filter((c) => looksLikePhoneNumber(c.name))

  console.log(`[cleanup] found ${phoneNamed.length} contact(s) with a phone number as the name.`)

  if (phoneNamed.length === 0) {
    console.log('[cleanup] Nothing to do.')
    await prisma.$disconnect()
    return
  }

  for (const c of phoneNamed) {
    if (c.mobile && c.mobile.trim() !== '') {
      console.warn(`[cleanup] ⚠️  ${c.id}: mobile already "${c.mobile}" — will overwrite name only.`)
    } else {
      console.log(`[cleanup]   ${c.id}: name="${c.name}" → mobile="${c.name}", name="Contact" (org=${c.organizationId})`)
    }
  }

  if (dryRun) {
    console.log('[cleanup] Dry run — skipping writes.')
    await prisma.$disconnect()
    return
  }

  // Update in batches.
  for (let i = 0; i < phoneNamed.length; i += BATCH_SIZE) {
    const batch = phoneNamed.slice(i, i + BATCH_SIZE)
    await prisma.$transaction(
      batch.map((c) =>
        prisma.contact.update({
          where: { id: c.id },
          data: {
            name: 'Contact',
            mobile: !c.mobile || c.mobile.trim() === '' ? c.name : c.mobile,
          },
        }),
      ),
    )
    console.log(`[cleanup] updated batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} rows`)
  }

  console.log(`[cleanup] ✅ Done. ${phoneNamed.length} contact(s) updated.`)
  await prisma.$disconnect()
}

main().catch((err) => {
  console.error('[cleanup] Error:', err)
  process.exit(1)
})
