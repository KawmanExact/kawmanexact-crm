import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { mobileGuard, badRequest } from '@/lib/mobile-api'
import { appendVisitReportToDailyReport } from '@/services/field-visit.service'

const schema = z.object({
  purpose: z.string().trim().min(2).max(2000),
  discussion: z.string().trim().min(10, 'Write what was discussed (min 10 chars)').max(8000),
  requirements: z.string().trim().max(4000).optional(),
  competitorInfo: z.string().trim().max(4000).optional(),
  customerFeedback: z.string().trim().max(4000).optional(),
  nextSteps: z.string().trim().min(3, 'Next steps are required').max(4000),
})

/**
 * Saves a VisitReport for the visit, then links it to today's DailyReport via
 * `appendVisitReportToDailyReport()` — the same single-source-of-truth function
 * the web form (src/app/field-sales/actions.ts → createVisitReportAction) uses.
 * Create/append on DRAFT; link-only on already-SUBMITTED (no mutation).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const g = await mobileGuard('field_visits.create')
  if ('error' in g) return g.error
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    const fe: Record<string, string> = {}
    for (const i of parsed.error.issues) fe[String(i.path[0])] = i.message
    return badRequest('Invalid report', fe)
  }
  const visit = await prisma.fieldVisit.findFirst({
    where: { id, organizationId: g.session.user.organizationId, assigneeId: g.session.user.id },
    select: { id: true, title: true, company: { select: { name: true } } },
  })
  if (!visit) return NextResponse.json({ error: 'Visit not found' }, { status: 404 })

  const d = parsed.data
  const report = await prisma.visitReport.create({
    data: {
      visitId: id,
      purpose: d.purpose,
      discussion: d.discussion,
      requirements: d.requirements || null,
      competitorInfo: d.competitorInfo || null,
      customerFeedback: d.customerFeedback || null,
      nextSteps: d.nextSteps,
      createdById: g.session.user.id,
    },
    select: { id: true },
  })

  // Same single-source-of-truth linkage the web form uses: create/append today's
  // DailyReport so Submit Daily Report already contains this field work.
  const dailyResult = await appendVisitReportToDailyReport({
    organizationId: g.session.user.organizationId,
    userId: g.session.user.id,
    visitTitle: visit.title,
    companyName: visit.company?.name ?? null,
    purpose: d.purpose,
    discussion: d.discussion,
    requirements: d.requirements || null,
    competitorInfo: d.competitorInfo || null,
    customerFeedback: d.customerFeedback || null,
    nextSteps: d.nextSteps,
  })

  return NextResponse.json({ id: report.id, dailyReportId: dailyResult.dailyReportId ?? undefined }, { status: 201 })
}
