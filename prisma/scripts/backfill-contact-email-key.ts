/**
 * Backfill `emailKey` for existing Contact rows.
 *
 * Reads every contact (email, organizationId), computes the normalised key via
 * buildContactEmailKey, and — BEFORE writing anything — detects groups of
 * contacts in the same organization that share the same non-null emailKey.
 * If any duplicate groups are found, it PRINTS them (organization, email, and
 * each contact's id, name, company, createdAt) and exits with code 1 WITHOUT
 * writing or deleting anything, so they can be resolved manually.
 *
 * If zero duplicate groups exist, it updates rows in batches of 500.
 *
 * Flags:
 *   --dry-run   Compute keys and show duplicate groups, but never write.
 *
 * Usage:
 *   npx tsx prisma/scripts/backfill-contact-email-key.ts
 *   npx tsx prisma/scripts/backfill-contact-email-key.ts --dry-run
 *   npm run db:backfill-email-key
 *   npm run db:backfill-email-key -- --dry-run
 */
import { prisma } from '../../src/lib/db'
import { buildContactEmailKey } from '../../src/lib/contact-dedupe'

const BATCH_SIZE = 500

async function main() {
  const dryRun = process.argv.includes('--dry-run')

  console.log(`[backfill] scanning contacts${dryRun ? ' (DRY RUN — no writes)' : ''}...`)

  const contacts = await prisma.contact.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      organizationId: true,
      companyId: true,
      createdAt: true,
      emailKey: true,
    },
  })

  console.log(`[backfill] found ${contacts.length} contacts`)

  // Group by (organizationId, emailKey) to detect duplicates.
  const groups = new Map<string, Array<{ id: string; name: string; companyId: string | null; createdAt: Date; email: string }>>()

  for (const c of contacts) {
    const key = buildContactEmailKey(c.email)
    // Only non-null keys can collide; null keys (no email) are expected to repeat.
    if (key === null) continue

    const mapKey = `${c.organizationId}\u0000${key}`
    const existing = groups.get(mapKey)
    if (existing) {
      existing.push({ id: c.id, name: c.name, companyId: c.companyId, createdAt: c.createdAt, email: c.email ?? '' })
    } else {
      groups.set(mapKey, [{ id: c.id, name: c.name, companyId: c.companyId, createdAt: c.createdAt, email: c.email ?? '' }])
    }
  }

  const duplicateGroups = [...groups.values()].filter((g) => g.length > 1)

  if (duplicateGroups.length > 0) {
    console.error(`[backfill] ❌ Found ${duplicateGroups.length} duplicate email group(s). Refusing to write.`)
    console.error('[backfill] Resolve these manually before proceeding:\n')
    for (const group of duplicateGroups) {
      console.error(`  Email: "${group[0].email}"`)
      for (const contact of group) {
        console.error(`    - ${contact.name} (id: ${contact.id}, companyId: ${contact.companyId ?? '—'}, createdAt: ${contact.createdAt.toISOString()})`)
      }
      console.error('')
    }
    console.error('[backfill] No rows were modified. Run with --dry-run to verify without side effects.')
    await prisma.$disconnect()
    process.exit(1)
  }

  // No duplicates — compute and write keys in batches.
  const toUpdate: Array<{ id: string; emailKey: string | null }> = []
  for (const c of contacts) {
    const key = buildContactEmailKey(c.email)
    // Skip rows whose key is already correct (idempotent).
    if (c.emailKey === key) continue
    toUpdate.push({ id: c.id, emailKey: key })
  }

  if (toUpdate.length === 0) {
    console.log('[backfill] All emailKey values are already up to date. Nothing to do.')
    await prisma.$disconnect()
    return
  }

  console.log(`[backfill] ${toUpdate.length} rows need updating.`)

  if (dryRun) {
    console.log('[backfill] Dry run — skipping writes.')
    await prisma.$disconnect()
    return
  }

  for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
    const batch = toUpdate.slice(i, i + BATCH_SIZE)
    await prisma.$transaction(
      batch.map((row) =>
        prisma.contact.update({
          where: { id: row.id },
          data: { emailKey: row.emailKey },
        }),
      ),
    )
    console.log(`[backfill] updated batch ${i / BATCH_SIZE + 1}: ${batch.length} rows`)
  }

  console.log(`[backfill] ✅ Done. ${toUpdate.length} rows updated.`)
  await prisma.$disconnect()
}

main().catch((err) => {
  console.error('[backfill] Error:', err)
  process.exit(1)
})
