import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { mobileGuard, badRequest } from '@/lib/mobile-api'

const schema = z.object({
  purpose: z.string().trim().min(2).max(2000),
  discussion: z.string().trim().min(10, 'Write what was discussed (min 10 chars)').max(8000),
  requirements: z.string().trim().max(4000).optional(),
  competitorInfo: z.string().trim().max(4000).optional(),
  customerFeedback: z.string().trim().max(4000).optional(),
  nextSteps: z.string().trim().min(3, 'Next steps are required').max(4000),
})

/**
 * Same VisitReport row the web form creates. The web action also appends to
 * today's DailyReport; that logic lives in a Server Action, so to keep a single
 * source of truth extract it to a service and call it from both places.
 * TODO(mobile): extract `appendFieldSnippetToDailyReport()` from
 * src/app/field-sales/actions.ts and call it here.
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
    select: { id: true },
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
  return NextResponse.json({ id: report.id }, { status: 201 })
}
