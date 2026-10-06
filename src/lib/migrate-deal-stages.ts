import { prisma } from '@/lib/db'
import type { DealStage } from '@/types/crm'

/**
 * Migration script to map existing deals from old stage names to new SPANCOPE stages.
 *
 * Old → New mapping:
 *   NEW_LEAD → SUSPECT
 *   CONTACTED → PROSPECT
 *   QUALIFIED → APPROACH_ANALYSE
 *   PROPOSAL → NEGOTIATE
 *   NEGOTIATION → CLOSE
 *   WON → PAYMENT
 *   LOST → LOST
 *
 * Also sets probability based on the new stage, and sets paymentStatus for
 * orders (PAYMENT stage). Existing data is preserved - only the stage,
 * probability, and related fields are updated.
 */

const OLD_TO_NEW: Record<string, string> = {
  NEW_LEAD: 'SUSPECT',
  CONTACTED: 'PROSPECT',
  QUALIFIED: 'APPROACH_ANALYSE',
  PROPOSAL: 'NEGOTIATE',
  NEGOTIATION: 'CLOSE',
  WON: 'PAYMENT',
  LOST: 'LOST',
}

const STAGE_PROBABILITY: Record<string, number> = {
  SUSPECT: 10,
  PROSPECT: 25,
  APPROACH_ANALYSE: 40,
  NEGOTIATE: 60,
  CLOSE: 75,
  ORDER: 90,
  PAYMENT: 100,
  LOST: 0,
}

export async function migrateDealStages(): Promise<{ updated: number; skipped: number }> {
  const allDeals = await prisma.deal.findMany({
    select: { id: true, stage: true, closedAt: true, organizationId: true },
  })

  let updated = 0
  let skipped = 0

  for (const deal of allDeals) {
    const oldStage = deal.stage as string
    const newStage = OLD_TO_NEW[oldStage]

    if (!newStage || newStage === oldStage) {
      skipped++
      continue
    }

    const probability = STAGE_PROBABILITY[newStage] ?? 0

    await prisma.deal.update({
      where: { id: deal.id },
      data: {
        stage: newStage as DealStage,
        probability: probability,
        paymentStatus: newStage === 'PAYMENT' ? 'PENDING' : undefined,
        closedAt: newStage === 'LOST' || newStage === 'PAYMENT' ? deal.closedAt : null,
        lostAt: newStage === 'LOST' ? deal.closedAt : null,
      },
    })

    await prisma.dealStageHistory.create({
      data: {
        dealId: deal.id,
        stage: newStage as DealStage,
        previousStage: oldStage as DealStage,
        probability,
        movedById: null,
        movedByName: 'Migration Script',
        organizationId: deal.organizationId,
      },
    })

    updated++
  }

  return { updated, skipped }
}

if (require.main === module) {
  migrateDealStages()
    .then(({ updated, skipped }) => {
      console.log(`Migration complete: ${updated} deals updated, ${skipped} skipped`)
      process.exit(0)
    })
    .catch((err) => {
      console.error('Migration failed:', err)
      process.exit(1)
    })
}
