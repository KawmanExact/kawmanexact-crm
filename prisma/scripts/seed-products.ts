/**
 * Seed the product catalog for one organisation with Kawman ExAct's real
 * products, so the sales dropdowns and the lead importer's "Products
 * Discussed" matching work out of the box.
 *
 * Idempotent: matches on (organizationId, name, variant) case-insensitively and
 * only fills fields that are still empty. Re-running never duplicates a row and
 * never overwrites a price somebody has since set.
 *
 * NO PRICES ARE INVENTED, AND THERE IS NO WAY TO SEED ONE. `defaultUnitPrice` is
 * always left null — a price list is a commercial decision and must be entered
 * per organisation in the Product Catalog after it is agreed.
 *
 * Flags:
 *   --dry-run            Report what would be created/updated, write nothing.
 *   --org=<slug>         Target organisation by slug (repeatable).
 *   --all-orgs           Seed every organisation in the database.
 *
 * Usage:
 *   npx tsx prisma/scripts/seed-products.ts --org=kawman
 *   npm run db:seed-products -- --org=kawman --dry-run
 */
import { createScriptPrismaClient } from './_client'

const prisma = createScriptPrismaClient()

/**
 * Local copy of product.service.ts's normalizeProductText. The service carries
 * `import 'server-only'`, which throws outside a Next.js bundle, so a tsx
 * script cannot import from it — the same reason lib/rbac-seed.ts has no
 * server-only marker.
 */
function normalizeProductText(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

interface SeedProduct {
  name: string
  variant: string | null
  category: string
  grade: string | null
  description: string
}

const CATALOG: SeedProduct[] = [
  {
    name: 'CarniExAct™',
    variant: null,
    category: 'Nutraceutical',
    grade: 'RD',
    description: 'CarniExAct™ nutraceutical ingredient.',
  },
  {
    name: 'BranChExAct™',
    variant: 'RD',
    category: 'Nutraceutical',
    grade: 'RD',
    description: 'BranChExAct™ branch-chain ingredient, RD grade.',
  },
  {
    name: 'AlphaExAct™',
    variant: null,
    category: 'Nutraceutical',
    grade: null,
    description: 'AlphaExAct™ nutraceutical ingredient.',
  },
  {
    name: 'CoQExAct™',
    variant: null,
    category: 'Nutraceutical',
    grade: null,
    description: 'CoQExAct™ nutraceutical ingredient.',
  },
  {
    name: 'ArginExAct™',
    variant: null,
    category: 'Nutraceutical',
    grade: null,
    description: 'ArginExAct™ nutraceutical ingredient.',
  },
  {
    name: 'VitExAct™ B12',
    variant: '1% WD',
    category: 'Nutraceutical',
    grade: null,
    description: 'VitExAct™ B12, 1% water dispersion.',
  },
  {
    name: 'VitExAct™ B12',
    variant: '0.1% WS',
    category: 'Nutraceutical',
    grade: null,
    description: 'VitExAct™ B12, 0.1% water soluble.',
  },
  {
    name: 'CafRelExAct™',
    variant: null,
    category: 'Food & Beverage',
    grade: null,
    description: 'CafRelExAct™ food & beverage ingredient.',
  },
]

function argValues(flag: string): string[] {
  return process.argv.filter((a) => a.startsWith(`--${flag}=`)).map((a) => a.slice(flag.length + 3))
}

async function resolveOrganizations(dryRun: boolean) {
  const slugs = argValues('org')
  const allOrgs = process.argv.includes('--all-orgs')

  if (slugs.length === 0 && !allOrgs) {
    const all = await prisma.organization.findMany({
      select: { id: true, name: true, slug: true },
      orderBy: { slug: 'asc' },
    })
    console.log(`[seed-products] No --org=<slug> or --all-orgs given. Available organisations:`)
    for (const org of all) console.log(`[seed-products]   ${org.slug}  (${org.name})`)
    console.log(
      '[seed-products] Re-run with e.g. --org=kawman, or --all-orgs to seed every organisation.'
    )
    if (!dryRun && !allOrgs) {
      await prisma.$disconnect()
      return []
    }
    return all
  }

  const where = allOrgs ? {} : { slug: { in: slugs } }
  const orgs = await prisma.organization.findMany({
    where,
    select: { id: true, name: true, slug: true },
    orderBy: { slug: 'asc' },
  })

  if (orgs.length === 0 && !allOrgs) {
    console.error(
      `[seed-products] No organisation matched ${JSON.stringify(slugs)}. Nothing was written.`
    )
  }
  return orgs
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')

  const organizations = await resolveOrganizations(dryRun)
  if (organizations.length === 0) {
    await prisma.$disconnect()
    return
  }

  for (const org of organizations) {
    console.log(`[seed-products] ${org.name} (${org.slug})${dryRun ? ' — DRY RUN' : ''}`)

    let created = 0
    let updated = 0

    for (const seed of CATALOG) {
      const variant = normalizeProductText(seed.variant)
      const existing = await prisma.product.findFirst({
        where: {
          organizationId: org.id,
          name: { equals: seed.name, mode: 'insensitive' },
          ...(variant === null ? { variant: null } : { variant: { equals: variant, mode: 'insensitive' } }),
        },
      })

      if (existing) {
        // Fill only blanks so a hand-edited catalog is never clobbered.
        // defaultUnitPrice is intentionally absent from this list: the script
        // has no price data and must never write a price column at all.
        const data = {
          ...(existing.category ? {} : { category: seed.category }),
          ...(existing.grade ? {} : { grade: seed.grade }),
          ...(existing.description ? {} : { description: seed.description }),
        }
        if (Object.keys(data).length > 0) {
          updated += 1
          console.log(`[seed-products]   update  ${seed.name}${variant ? ` (${variant})` : ''}`)
          if (!dryRun) await prisma.product.update({ where: { id: existing.id }, data })
        } else {
          console.log(`[seed-products]   present ${seed.name}${variant ? ` (${variant})` : ''}`)
        }
        continue
      }

      created += 1
      console.log(`[seed-products]   create  ${seed.name}${variant ? ` (${variant})` : ''}`)
      if (!dryRun) {
        await prisma.product.create({
          data: {
            organizationId: org.id,
            name: seed.name,
            variant,
            category: seed.category,
            grade: seed.grade,
            description: seed.description,
            unit: 'kg',
            // defaultUnitPrice is omitted on purpose — no prices are invented.
          },
        })
      }
    }

    console.log(`[seed-products] ${org.slug}: ${created} created, ${updated} updated.`)
  }

  console.log('[seed-products] defaultUnitPrice left NULL on purpose — set prices in the Product Catalog.')
  console.log(`[seed-products] ${dryRun ? 'DRY RUN — nothing written.' : 'Done.'}`)

  await prisma.$disconnect()
}

main().catch((err) => {
  console.error('[seed-products] Error:', err)
  process.exit(1)
})
