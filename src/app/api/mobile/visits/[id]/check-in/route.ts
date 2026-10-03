import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { mobileGuard, badRequest, isTrustedCloudinaryImage } from '@/lib/mobile-api'
import { createCheckIn } from '@/services/field-visit.service'

const schema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().min(0).max(50000).optional(),
  // Android reports Location.isMock; the app forwards it here.
  mocked: z.boolean().optional(),
  notes: z.string().trim().max(2000).optional(),
  photoUrl: z.string().url().optional(),
})

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const g = await mobileGuard('field_visits.update', { key: 'mobile-checkin', max: 20, windowSec: 60 })
  if ('error' in g) return g.error
  const { session } = g

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return badRequest('Invalid check-in')
  const d = parsed.data

  // Mock-location apps are the easy way to fake a visit. Reject them outright.
  // (Advisory only: a rooted phone can hide this flag; see admin review of
  // accuracy/photo on the Check-ins page for the rest.)
  if (d.mocked) {
    return NextResponse.json(
      { error: 'Mock location detected. Turn off any fake-GPS app and try again.' },
      { status: 422 },
    )
  }

  const visit = await prisma.fieldVisit.findFirst({
    where: { id, organizationId: session.user.organizationId, assigneeId: session.user.id },
    select: { id: true },
  })
  if (!visit) return NextResponse.json({ error: 'Visit not found' }, { status: 404 })

  if (d.photoUrl && !isTrustedCloudinaryImage(d.photoUrl, session.user.organizationId)) {
    return badRequest('Photo must be uploaded through the app.')
  }

  const result = await createCheckIn({
    visitId: id,
    latitude: d.latitude,
    longitude: d.longitude,
    accuracy: d.accuracy,
    notes: d.notes,
    photoUrl: d.photoUrl ?? null,
  })
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ ok: true, checkInId: result.data.id, verificationStatus: result.data.verificationStatus })
}
