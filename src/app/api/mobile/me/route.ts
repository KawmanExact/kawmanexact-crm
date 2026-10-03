import { NextResponse } from 'next/server'
import { mobileGuard } from '@/lib/mobile-api'

export async function GET() {
  const g = await mobileGuard()
  if ('error' in g) return g.error
  const u = g.session.user
  return NextResponse.json({
    id: u.id,
    name: u.name,
    email: u.email,
    organizationId: u.organizationId,
    roles: u.roles,
    permissions: u.permissions,
  })
}
