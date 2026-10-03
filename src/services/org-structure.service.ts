import 'server-only'
import { prisma } from '@/lib/db'
import { requireApiSession } from '@/lib/session'

export interface DepartmentRow {
  id: string
  name: string
  description: string | null
  manager: string | null
  userCount: number
  teamCount: number
}

export async function getDepartments(): Promise<DepartmentRow[]> {
  const session = await requireApiSession()
  const rows = await prisma.department.findMany({
    where: { organizationId: session.user.organizationId },
    include: { manager: { select: { name: true } }, _count: { select: { users: true, teams: true } } },
    orderBy: { name: 'asc' },
  })
  return rows.map((d) => ({
    id: d.id,
    name: d.name,
    description: d.description,
    manager: d.manager?.name ?? null,
    userCount: d._count.users,
    teamCount: d._count.teams,
  }))
}

export interface TeamRow {
  id: string
  name: string
  description: string | null
  department: string | null
  manager: string | null
  status: string
  userCount: number
}

export async function getTeams(): Promise<TeamRow[]> {
  const session = await requireApiSession()
  const rows = await prisma.team.findMany({
    where: { organizationId: session.user.organizationId },
    include: {
      department: { select: { name: true } },
      manager: { select: { name: true } },
      _count: { select: { users: true } },
    },
    orderBy: { name: 'asc' },
  })
  return rows.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    department: t.department?.name ?? null,
    manager: t.manager?.name ?? null,
    status: t.status,
    userCount: t._count.users,
  }))
}
