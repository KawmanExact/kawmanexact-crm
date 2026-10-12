import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

vi.mock('@/lib/mobile-api', () => ({
  mobileGuard: vi.fn(),
  badRequest: vi.fn((error: string, fieldErrors?: Record<string, string>) =>
    NextResponse.json({ error, fieldErrors }, { status: 400 }),
  ),
}))

vi.mock('@/lib/db', () => ({
  prisma: {
    product: { findMany: vi.fn() },
  },
}))

import { mobileGuard } from '@/lib/mobile-api'
import { prisma } from '@/lib/db'

const mockMobileGuard = vi.mocked(mobileGuard)
const mockFindMany = vi.mocked(prisma.product.findMany)

const mockSession = {
  user: {
    id: 'user-1',
    name: 'Test User',
    email: 'test@example.com',
    organizationId: 'org-A',
    permissions: ['field_visits.view'],
  },
}

const req = (query = '') =>
  new Request(`http://localhost/api/mobile/products${query}`, { method: 'GET' })

beforeEach(() => {
  vi.clearAllMocks()
  mockMobileGuard.mockResolvedValue({ session: mockSession as never })
  mockFindMany.mockResolvedValue([] as never)
})

describe('GET /api/mobile/products', () => {
  it('returns 401 when unauthenticated', async () => {
    mockMobileGuard.mockResolvedValueOnce({ error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) })
    const { GET } = await import('@/app/api/mobile/products/route')
    const res = await GET(req())
    expect(res.status).toBe(401)
  })

  it('returns 403 when the user lacks field_visits.view', async () => {
    mockMobileGuard.mockResolvedValueOnce({
      error: NextResponse.json({ error: 'You do not have permission to do this.' }, { status: 403 }),
    })
    const { GET } = await import('@/app/api/mobile/products/route')
    const res = await GET(req())
    expect(res.status).toBe(403)
  })

  it('returns active products scoped to the caller organization', async () => {
    mockFindMany.mockResolvedValueOnce([
      { id: 'p1', name: 'Curcumin', variant: '95% WD', category: 'Nutraceutical' },
      { id: 'p2', name: 'Vitamin C', variant: null, category: 'Vitamins' },
    ] as never)
    const { GET } = await import('@/app/api/mobile/products/route')
    const res = await GET(req())
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.products).toEqual([
      { id: 'p1', label: 'Curcumin (95% WD)', category: 'Nutraceutical' },
      { id: 'p2', label: 'Vitamin C', category: 'Vitamins' },
    ])
  })

  it('filters inactive products (isActive = true)', async () => {
    mockFindMany.mockResolvedValueOnce([] as never)
    const { GET } = await import('@/app/api/mobile/products/route')
    await GET(req())
    const whereArg = mockFindMany.mock.calls[0][0].where
    expect(whereArg.isActive).toBe(true)
  })

  it('scopes products to the caller organization', async () => {
    mockFindMany.mockResolvedValueOnce([] as never)
    const { GET } = await import('@/app/api/mobile/products/route')
    await GET(req())
    const whereArg = mockFindMany.mock.calls[0][0].where
    expect(whereArg.organizationId).toBe('org-A')
  })

  it('applies case-insensitive search on name, variant, category', async () => {
    mockFindMany.mockResolvedValueOnce([] as never)
    const { GET } = await import('@/app/api/mobile/products/route')
    await GET(req('?q=curc'))
    const whereArg = mockFindMany.mock.calls[0][0].where
    expect(whereArg.OR).toEqual([
      { name: { contains: 'curc', mode: 'insensitive' } },
      { variant: { contains: 'curc', mode: 'insensitive' } },
      { category: { contains: 'curc', mode: 'insensitive' } },
    ])
  })

  it('caps results at 500 rows', async () => {
    mockFindMany.mockResolvedValueOnce([] as never)
    const { GET } = await import('@/app/api/mobile/products/route')
    await GET(req())
    const takeArg = mockFindMany.mock.calls[0][0].take
    expect(takeArg).toBe(500)
  })

  it('orders by name asc', async () => {
    mockFindMany.mockResolvedValueOnce([] as never)
    const { GET } = await import('@/app/api/mobile/products/route')
    await GET(req())
    const orderByArg = mockFindMany.mock.calls[0][0].orderBy
    expect(orderByArg).toEqual({ name: 'asc' })
  })
})