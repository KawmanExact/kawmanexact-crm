#!/usr/bin/env tsx
/**
 * Two-part backfill for the Company -> Contact -> Deal -> FollowUp hierarchy:
 *
 * Part 1 — FollowUp.contactId
 *   For each FollowUp whose contactId is null:
 *     - If dealId is set: copy contactId and companyId from the deal
 *     - Else if only companyId is set: leave as-is (company-level follow-up)
 *     - Else if leadId is set: leave as-is (legacy lead follow-up)
 *
 * Part 2 — Deal.nextFollowUp (sync column from FollowUp table)
 *   The FollowUp table is authoritative. For every deal whose nextFollowUp
 *   column is null or differs from the earliest PENDING follow-up's dueDate,
 *   (re)compute from the table. For deals with nextFollowUp set but no
 *   pending follow-up, create one so the column and the table agree.
 *
 * Run with: npx tsx prisma/scripts/backfill-followup-contact.ts
 */

import { createScriptPrismaClient } from './_client'

const prisma = createScriptPrismaClient()

async function backfillFollowUpContactId() {
  console.log('--- Part 1: FollowUp.contactId backfill ---')

  const followUps = await prisma.followUp.findMany({
    where: {
      contactId: null,
      OR: [{ dealId: { not: null } }, { companyId: { not: null } }],
    },
    select: {
      id: true,
      dealId: true,
      companyId: true,
      contactId: true,
      leadId: true,
    },
  })

  console.log(`Found ${followUps.length} follow-ups to process`)

  let updated = 0
  let skipped = 0

  for (const fu of followUps) {
    let newContactId: string | null = null
    let newCompanyId: string | null = fu.companyId

    if (fu.dealId) {
      const deal = await prisma.deal.findUnique({
        where: { id: fu.dealId },
        select: { contactId: true, companyId: true },
      })
      if (deal) {
        newContactId = deal.contactId ?? null
        newCompanyId = deal.companyId ?? fu.companyId ?? null
      }
    }

    if (newContactId !== fu.contactId || newCompanyId !== fu.companyId) {
      await prisma.followUp.update({
        where: { id: fu.id },
        data: {
          contactId: newContactId,
          companyId: newCompanyId,
        },
      })
      updated++
      console.log(`  Updated follow-up ${fu.id}: contactId=${newContactId}, companyId=${newCompanyId}`)
    } else {
      skipped++
    }
  }

  console.log(`FollowUp backfill complete: ${updated} updated, ${skipped} skipped`)
}

async function backfillDealNextFollowUp() {
  console.log('--- Part 2: Deal.nextFollowUp backfill ---')

  // Find deals that have nextFollowUp set but no PENDING follow-up row
  const dealsWithColumn = await prisma.deal.findMany({
    where: { nextFollowUp: { not: null } },
    select: { id: true, name: true, nextFollowUp: true, contactId: true, companyId: true, organizationId: true, ownerId: true },
  })

  let created = 0
  let synced = 0

  for (const deal of dealsWithColumn) {
    // Check if a PENDING follow-up already exists for this deal
    const existingPending = await prisma.followUp.findFirst({
      where: {
        dealId: deal.id,
        organizationId: deal.organizationId,
        status: 'PENDING',
      },
      select: { dueDate: true },
    })

    if (!existingPending) {
      // No pending follow-up exists but the column is set — create one
      await prisma.followUp.create({
        data: {
          title: `Follow up on ${deal.name}`,
          description: '',
          dueDate: deal.nextFollowUp!,
          priority: 'MEDIUM',
          status: 'PENDING',
          organizationId: deal.organizationId,
          ownerId: deal.ownerId,
          contactId: deal.contactId,
          companyId: deal.companyId,
          dealId: deal.id,
        },
      })
      created++
      console.log(`  Created FollowUp for deal ${deal.id} (${deal.name}) at ${deal.nextFollowUp}`)
    } else if (existingPending.dueDate.getTime() !== deal.nextFollowUp!.getTime()) {
      // Pending follow-up exists but date differs — sync the column to the table value
      await prisma.deal.update({
        where: { id: deal.id },
        data: { nextFollowUp: existingPending.dueDate },
      })
      synced++
      console.log(`  Synced nextFollowUp column for deal ${deal.id} to ${existingPending.dueDate}`)
    }
  }

  // Also fix deals whose nextFollowUp column is null but has pending follow-ups
  const dealsNeedingNull = await prisma.deal.findMany({
    where: {
      nextFollowUp: null,
      followUps: { some: { status: 'PENDING' } },
    },
    select: { id: true, name: true, organizationId: true },
  })

  for (const deal of dealsNeedingNull) {
    const earliest = await prisma.followUp.findFirst({
      where: {
        dealId: deal.id,
        organizationId: deal.organizationId,
        status: 'PENDING',
      },
      orderBy: { dueDate: 'asc' },
      select: { dueDate: true },
    })
    if (earliest) {
      await prisma.deal.update({
        where: { id: deal.id },
        data: { nextFollowUp: earliest.dueDate },
      })
      synced++
      console.log(`  Set nextFollowUp for deal ${deal.id} (${deal.name}) to ${earliest.dueDate}`)
    }
  }

  console.log(`Deal nextFollowUp backfill: ${created} created, ${synced} synced`)
}

async function main() {
  console.log('Starting backfill...')
  await backfillFollowUpContactId()
  await backfillDealNextFollowUp()
  console.log('All backfills complete.')
}

main()
  .catch((e) => {
    console.error('Backfill failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
