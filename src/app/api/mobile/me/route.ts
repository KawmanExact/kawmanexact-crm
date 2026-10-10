import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { mobileGuard, badRequest } from '@/lib/mobile-api'

export async function GET() {
  const g = await mobileGuard()
  if ('error' in g) return g.error
  const { session } = g
  const u = session.user
  const dbUser = await prisma.user.findFirst({
    where: { id: u.id, organizationId: u.organizationId },
    select: { id: true, name: true, email: true, phone: true, designation: true, roles: true, organizationId: true },
  })
  return NextResponse.json({
    id: u.id,
    name: dbUser?.name ?? u.name,
    email: u.email,
    phone: dbUser?.phone ?? null,
    designation: dbUser?.designation ?? null,
    organizationId: u.organizationId,
    roles: u.roles,
    permissions: u.permissions,
  })
}

const updateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  phone: z.string().trim().max(30).optional(),
  designation: z.string().trim().max(100).optional(),
})

/** Self-service profile update — a rep can edit their own name/phone/designation. */
export async function PATCH(request: Request) {
  const g = await mobileGuard()
  if ('error' in g) return g.error
  const { session } = g

  const body = await request.json().catch(() => null)
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    const fe: Record<string, string> = {}
    for (const i of parsed.error.issues) fe[String(i.path[0])] = i.message
    return badRequest('Invalid input', fe)
  }
  const d = parsed.data

  const updated = await prisma.user.update({
    where: { id: session.user.id, organizationId: session.user.organizationId },
    data: {
      ...(d.name !== undefined && { name: d.name }),
      ...(d.phone !== undefined && { phone: d.phone }),
      ...(d.designation !== undefined && { designation: d.designation }),
    },
    select: { id: true, name: true, email: true, phone: true, designation: true, roles: true, organizationId: true },
  })

  return NextResponse.json({
    user: {
      id: updated.id,
      name: updated.name,
      email: updated.email,
      phone: updated.phone,
      designation: updated.designation,
      organizationId: updated.organizationId,
    },
  })
}
