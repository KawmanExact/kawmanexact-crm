import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { mobileGuard, badRequest } from '@/lib/mobile-api'

const schema = z.object({
  status: z.enum(['SCHEDULED', 'ON_THE_WAY', 'CHECKED_IN', 'IN_MEETING', 'COMPLETED', 'CANCELLED']),
})

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const g = await mobileGuard('field_visits.update')
  if ('error' in g) return g.error
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return badRequest('Invalid status')

  const existing = await prisma.fieldVisit.findFirst({
    where: { id, organizationId: g.session.user.organizationId, assigneeId: g.session.user.id },
  })
  if (!existing) return NextResponse.json({ error: 'Visit not found' }, { status: 404 })

  await prisma.fieldVisit.update({
    where: { id },
    data: {
      status: parsed.data.status,
      completedAt: parsed.data.status === 'COMPLETED' ? new Date() : existing.completedAt,
    },
  })
  return NextResponse.json({ ok: true })
}
