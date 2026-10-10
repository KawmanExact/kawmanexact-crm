import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { mobileGuard } from '@/lib/mobile-api'

/** Companies in the user's organization — for dropdown selectors on the mobile app. */
export async function GET() {
  const g = await mobileGuard('field_visits.view')
  if ('error' in g) return g.error
  const { session } = g

  const rows = await prisma.company.findMany({
    where: { organizationId: session.user.organizationId },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
    take: 200,
  })

  return NextResponse.json({
    companies: rows.map((c) => ({ id: c.id, name: c.name })),
  })
}
