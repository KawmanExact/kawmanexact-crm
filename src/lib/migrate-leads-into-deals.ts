import { prisma } from '@/lib/db'
import { toMoney } from '@/lib/sales-money'
import { getStageProbability, mapOldStageToNew } from '@/lib/deal-pipeline'
import type { DealStage } from '@/types/crm'

/**
 * One-off migration: fold every pre-existing `Lead` row into a `Deal`.
 *
 * Deals and leads are the same record now — the Deal row carries every field
 * the lead form collected — so each old lead becomes a deal carrying its own
 * data across, entering the pipeline at SUSPECT (or the stage its old status
 * maps to). `Deal.leadId` points back at the source lead, which is how
 * `/leads/{id}` links still resolve.
 *
 * Idempotent: a lead that already has a linked deal is skipped, so re-running
 * after a partial run creates nothing extra.
 *
 * Run with: npx tsx src/lib/migrate-leads-into-deals.ts
 */
export async function migrateLeadsIntoDeals(): Promise<{
  created: number
  skipped: number
}> {
  const leads = await prisma.lead.findMany({
    include: { deals: { select: { id: true }, take: 1 } },
  })

  let created = 0
  let skipped = 0

  for (const lead of leads) {
    if (lead.deals.length > 0) {
      skipped++
      continue
    }

    // Old lead statuses line up one-to-one with the funnel (NEW -> SUSPECT,
    // WON -> PAYMENT, LOST -> LOST). LOST is preserved as-is; everything else
    // that isn't a known status also lands at SUSPECT.
    const stage: DealStage = mapOldStageToNew(lead.status)
    const lost = stage === 'LOST'

    await prisma.$transaction(async (tx) => {
      const deal = await tx.deal.create({
        data: {
          name: lead.company ? `${lead.company} — ${lead.name}` : lead.name,
          // No historical figure existed on the lead; zero rather than a guess.
          value: toMoney(0),
          stage,
          probability: getStageProbability(stage),
          organizationId: lead.organizationId,
          ownerId: lead.ownerId,
          companyId: lead.companyId,
          segment: lead.segment,
          notes: lead.notes,
          lastActivityAt: lead.lastActivityAt,
          leadId: lead.id,
          email: lead.email,
          phone: lead.phone,
          source: lead.source,
          contactPerson: lead.contactPerson,
          designation: lead.designation,
          meetingDate: lead.meetingDate,
          meetingAt: lead.meetingAt,
          meetingMode: lead.meetingMode,
          purposeOfVisit: lead.purposeOfVisit,
          productsDiscussed: lead.productsDiscussed ?? [],
          customProductNames: lead.customProductNames ?? [],
          keyDiscussionPoints: lead.keyDiscussionPoints,
          customerRequirement: lead.customerRequirement,
          grade: lead.grade,
          cdaStatus: lead.cdaStatus,
          samplingStatus: lead.samplingStatus,
          rndFeedback: lead.rndFeedback,
          remark: lead.remark,
          nextFollowUp: lead.nextFollowUp,
          loaStatus: lead.loaStatus,
          closedAt: lost ? new Date() : null,
          lostAt: lost ? new Date() : null,
        },
      })

      // Carry the lead's history onto the deal so the activity feed isn't
      // emptied out by the merge.
      await tx.activity.updateMany({ where: { leadId: lead.id }, data: { dealId: deal.id } })
      await tx.followUp.updateMany({ where: { leadId: lead.id }, data: { dealId: deal.id } })
    })

    created++
  }

  return { created, skipped }
}

if (require.main === module) {
  migrateLeadsIntoDeals()
    .then(({ created, skipped }) => {
      console.log(`Migration complete: ${created} deal(s) created from leads, ${skipped} already migrated`)
      process.exit(0)
    })
    .catch((err) => {
      console.error('Migration failed:', err)
      process.exit(1)
    })
}