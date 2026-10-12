import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { mobileGuard } from '@/lib/mobile-api'

/** Active products in the caller's organization — for multi-select on the mobile app. */
export async function GET(request: Request) {
  const g = await mobileGuard('field_visits.view')
  if ('error' in g) return g.error
  const { session } = g

  const search = new URL(request.url).searchParams.get('q')?.trim()

  const where: {
    organizationId: string
    isActive: boolean
    OR?: Array<{ name?: { contains: string; mode: 'insensitive' }; variant?: { contains: string; mode: 'insensitive' }; category?: { contains: string; mode: 'insensitive' } }>
  } = {
    organizationId: session.user.organizationId,
    isActive: true,
  }
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { variant: { contains: search, mode: 'insensitive' } },
      { category: { contains: search, mode: 'insensitive' } },
    ]
  }

  const rows = await prisma.product.findMany({
    where,
    select: { id: true, name: true, variant: true, category: true },
    orderBy: { name: 'asc' },
    take: 500,
  })

  return NextResponse.json({
    products: rows.map((p) => ({
      id: p.id,
      label: p.variant ? `${p.name} (${p.variant})` : p.name,
      category: p.category ?? null,
    })),
  })
}
