import 'server-only'
import { prisma } from '@/lib/db'
import { requireApiSession } from '@/lib/session'
import type { FieldVisit, CheckIn, GeoFence, VisitReport, LiveMapVisit, VisitStatus, ActiveUserPin } from '@/types/field-sales'
import { ok, err, Result } from '@/lib/result'

function initials(name: string): string {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
}

function toNum(v: unknown): number | null {
  return v === null || v === undefined ? null : Number(v)
}

/** Haversine distance in meters between two lat/lng points. */
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

// ============================================================
// Field Visits
// ============================================================

type VisitRow = Awaited<ReturnType<typeof fetchVisits>>[number]

async function fetchVisits(organizationId: string, where: Record<string, unknown> = {}) {
  return prisma.fieldVisit.findMany({
    where: { organizationId, ...where },
    include: {
      assignee: { select: { name: true } },
      company: { select: { id: true, name: true } },
      contact: { select: { name: true } },
      deal: { select: { name: true } },
      checkIns: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
    orderBy: { scheduledAt: 'desc' },
  })
}

function mapVisit(row: VisitRow): FieldVisit {
  const lastCheckIn = row.checkIns[0]
  return {
    id: row.id,
    title: row.title,
    purpose: row.purpose,
    scheduledAt: row.scheduledAt.toISOString(),
    status: row.status as VisitStatus,
    latitude: toNum(row.latitude),
    longitude: toNum(row.longitude),
    address: row.address,
    assignee: row.assignee.name ?? 'Unassigned',
    assigneeInitials: initials(row.assignee.name ?? 'U'),
    assigneeId: row.assigneeId,
    company: row.company?.name ?? null,
    companyId: row.companyId,
    contact: row.contact?.name ?? null,
    deal: row.deal?.name ?? null,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    lastCheckIn: lastCheckIn
      ? {
          verificationStatus: lastCheckIn.verificationStatus,
          distanceFromCustomer: toNum(lastCheckIn.distanceFromCustomer),
          photoUrl: lastCheckIn.photoUrl ?? null,
          createdAt: lastCheckIn.createdAt.toISOString(),
        }
      : null,
  }
}

export async function getFieldVisits(): Promise<FieldVisit[]> {
  const session = await requireApiSession()
  const rows = await fetchVisits(session.user.organizationId)
  return rows.map(mapVisit)
}

/** Visits assigned to the current user — powers /field-sales/assigned + the notification target. */
export async function getAssignedVisits(): Promise<FieldVisit[]> {
  const session = await requireApiSession()
  const rows = await fetchVisits(session.user.organizationId, { assigneeId: session.user.id })
  return rows.map(mapVisit)
}

export type FieldVisitSortKey = 'scheduledAt' | 'title' | 'createdAt'

export interface FieldVisitQuery {
  search?: string
  status?: VisitStatus
  sortKey?: FieldVisitSortKey
  sortDir?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}

export interface FieldVisitPageResult {
  visits: FieldVisit[]
  total: number
  page: number
  pageSize: number
  pageCount: number
}

const VISIT_SORT_FIELD: Record<FieldVisitSortKey, string> = {
  scheduledAt: 'scheduledAt',
  title: 'title',
  createdAt: 'createdAt',
}

/**
 * Server-side paginated + searched + sorted field-visit listing for the
 * main /field-sales list page — mirrors services/lead.service.ts#getLeadsPage.
 *
 * Kept separate from getFieldVisits()/getTodaysVisits(): the latter backs
 * /field-sales/visits ("Today's Visits"), which is inherently a small,
 * bounded set (one day's schedule) where pagination isn't meaningful —
 * changing its shape would be scope creep for no benefit there.
 */
export async function getFieldVisitsPage(query: FieldVisitQuery = {}): Promise<FieldVisitPageResult> {
  const session = await requireApiSession()
  const page = Math.max(1, query.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 25))
  const sortKey = query.sortKey ?? 'scheduledAt'
  const sortDir = query.sortDir ?? 'desc'
  const search = query.search?.trim()

  const where = {
    organizationId: session.user.organizationId,
    ...(query.status ? { status: query.status } : {}),
    ...(search
      ? {
          OR: [
            { title: { contains: search, mode: 'insensitive' as const } },
            { company: { name: { contains: search, mode: 'insensitive' as const } } },
            { assignee: { name: { contains: search, mode: 'insensitive' as const } } },
          ],
        }
      : {}),
  }

  const [total, rows] = await Promise.all([
    prisma.fieldVisit.count({ where }),
    prisma.fieldVisit.findMany({
      where,
      include: {
        assignee: { select: { name: true } },
        company: { select: { id: true, name: true } },
        contact: { select: { name: true } },
        deal: { select: { name: true } },
        checkIns: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { [VISIT_SORT_FIELD[sortKey]]: sortDir },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])

  return {
    visits: rows.map(mapVisit),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  }
}

export async function getTodaysVisits(): Promise<FieldVisit[]> {
  const session = await requireApiSession()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const rows = await fetchVisits(session.user.organizationId, { scheduledAt: { gte: today, lt: tomorrow } })
  return rows.map(mapVisit)
}

export async function getFieldVisitById(id: string): Promise<FieldVisit | null> {
  const session = await requireApiSession()
  const rows = await fetchVisits(session.user.organizationId, { id })
  const row = rows[0]
  return row ? mapVisit(row) : null
}

// ============================================================
// Live map
// ============================================================

/** Visits with coordinates scheduled today or currently in progress — what the live map plots. */
export async function getLiveMapVisits(): Promise<LiveMapVisit[]> {
  const session = await requireApiSession()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const rows = await prisma.fieldVisit.findMany({
    where: {
      organizationId: session.user.organizationId,
      latitude: { not: null },
      longitude: { not: null },
      OR: [{ scheduledAt: { gte: today, lt: tomorrow } }, { status: { in: ['ON_THE_WAY', 'CHECKED_IN', 'IN_MEETING'] } }],
    },
    include: { assignee: { select: { name: true } }, company: { select: { name: true } } },
    orderBy: { scheduledAt: 'asc' },
  })

  return rows
    .filter((r) => r.latitude != null && r.longitude != null)
    .map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status as VisitStatus,
      assignee: r.assignee.name ?? 'Unassigned',
      assigneeInitials: initials(r.assignee.name ?? 'U'),
      latitude: Number(r.latitude),
      longitude: Number(r.longitude),
      companyName: r.company?.name ?? null,
      address: r.address,
    }))
}

export async function getActiveUsersForMap(): Promise<ActiveUserPin[]> {
  const session = await requireApiSession()
  const organizationId = session.user.organizationId
  const now = Date.now()
  const heartbeatCutoff = new Date(now - 5 * 60 * 1000) // 5 min heartbeat window — Session.lastSeenAt gate
  const liveCutoff = new Date(now - 10 * 60 * 1000) // 10 min — beyond this live location is stale

  // 1) Gate by Session.lastSeenAt — active presence per spec
  const recentSessions = await prisma.session.findMany({
    where: { user: { organizationId }, lastSeenAt: { gte: heartbeatCutoff } },
    select: { userId: true, lastSeenAt: true, user: { select: { name: true } } },
    orderBy: { lastSeenAt: 'desc' },
    take: 100,
  })
  const byUser = new Map<string, { lastSeenAt: Date; name: string | null }>()
  for (const s of recentSessions) {
    if (!byUser.has(s.userId)) byUser.set(s.userId, { lastSeenAt: s.lastSeenAt ?? new Date(), name: s.user.name })
  }

  // Also include users who are actively streaming even if heartbeat is slightly stale (race)
    // — any UserLiveLocation in this org touched in last 10 min and still isTracking
    const extraLocs = await prisma.userLiveLocation.findMany({
      where: { organizationId, updatedAt: { gte: liveCutoff }, isTracking: true },
      select: { userId: true, updatedAt: true, user: { select: { name: true } } },
      take: 100,
    })
    for (const e of extraLocs) {
      if (!byUser.has(e.userId)) {
        byUser.set(e.userId, { lastSeenAt: e.updatedAt, name: e.user.name })
      }
    }

    if (byUser.size === 0) return []

    const userIds = [...byUser.keys()]

  // 2) Primary: live tracking table — current rep locations per spec
  let liveRows: Awaited<ReturnType<typeof prisma.userLiveLocation.findMany<{ include: { user: { select: { name: true } } } }>>> = []
  try {
    liveRows = await prisma.userLiveLocation.findMany({
      where: { userId: { in: userIds } },
      include: { user: { select: { name: true } } },
    })
  } catch {}
  const liveByUser = new Map<string, (typeof liveRows)[number]>()
  for (const r of liveRows) liveByUser.set(r.userId, r)

  // 3) Fallback: last check-in location (keeps map useful before first live ping)
  const lastCheckIns = await prisma.checkIn.findMany({
    where: { userId: { in: userIds }, visit: { organizationId } },
    include: { user: { select: { name: true } }, visit: { select: { title: true, company: { select: { name: true } } } } },
    orderBy: { createdAt: 'desc' },
  })
  const checkInByUser = new Map<string, typeof lastCheckIns[number]>()
  for (const c of lastCheckIns) if (!checkInByUser.has(c.userId)) checkInByUser.set(c.userId, c)

  const pins: ActiveUserPin[] = []
  for (const [userId, meta] of byUser) {
    const live = liveByUser.get(userId)
    const fallback = checkInByUser.get(userId)
    const nm = meta.name ?? (live as unknown as { user?: { name: string | null } })?.user?.name ?? fallback?.user?.name ?? 'Unknown'
    const initialsVal = nm.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) || 'U'

    // Prefer live location if fresh and tracking
    if (live) {
      const liveAge = now - new Date(live.updatedAt).getTime()
      const isStale = liveAge > 2 * 60 * 1000 || !live.isTracking // 2 min without update or explicitly stopped
      // Still show if live exists even when stale (dimmed), unless very old (>10 min and no fallback? still show stale)
      pins.push({
        id: userId,
        name: nm,
        initials: initialsVal,
        latitude: Number(live.latitude),
        longitude: Number(live.longitude),
        lastSeenAt: meta.lastSeenAt.toISOString(),
        lastCheckInAt: fallback?.createdAt?.toISOString() ?? null,
        companyName: fallback?.visit?.company?.name ?? null,
        visitTitle: fallback?.visit?.title ?? null,
        accuracy: live.accuracy != null ? Number(live.accuracy) : null,
        heading: live.heading != null ? Number(live.heading) : null,
        speed: live.speed != null ? Number(live.speed) : null,
        updatedAt: new Date(live.updatedAt).toISOString(),
        isTracking: Boolean(live.isTracking) && !isStale,
        isStale,
      })
      continue
    }

    // No live row — fall back to last check-in so existing visits/check-ins still appear
    if (!fallback) continue
    const checkInAge = now - new Date(fallback.createdAt).getTime()
    const isStale = checkInAge > 10 * 60 * 1000
    pins.push({
      id: userId,
      name: nm,
      initials: initialsVal,
      latitude: Number(fallback.latitude),
      longitude: Number(fallback.longitude),
      lastSeenAt: meta.lastSeenAt.toISOString(),
      lastCheckInAt: fallback.createdAt.toISOString(),
      companyName: fallback.visit.company?.name ?? null,
      visitTitle: fallback.visit.title,
      accuracy: fallback.accuracy != null ? Number(fallback.accuracy) : null,
      heading: null,
      speed: null,
      updatedAt: fallback.createdAt.toISOString(),
      isTracking: false,
      isStale,
    })
  }

  // Most recently updated first — active trackers on top
  pins.sort((a, b) => {
    if (a.isTracking !== b.isTracking) return a.isTracking ? -1 : 1
    if (a.isStale !== b.isStale) return a.isStale ? 1 : -1
    const at = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
    const bt = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
    return bt - at
  })
  return pins
}

export async function getActiveGeoFencesForMap(): Promise<GeoFence[]> {
  const session = await requireApiSession()
  const rows = await prisma.geoFence.findMany({
    where: { organizationId: session.user.organizationId, isActive: true },
    include: { company: { select: { name: true } } },
  })
  return rows.map(mapGeoFence)
}

// ============================================================
// Check-ins
// ============================================================

export async function getCheckIns(): Promise<CheckIn[]> {
  const session = await requireApiSession()
  const rows = await prisma.checkIn.findMany({
    where: { visit: { organizationId: session.user.organizationId } },
    include: {
      user: { select: { name: true } },
      visit: { select: { title: true, company: { select: { name: true } } } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
  return rows.map((r) => ({
    id: r.id,
    visitId: r.visitId,
    visitTitle: r.visit.title,
    companyName: r.visit.company?.name ?? null,
    user: r.user.name ?? 'Unknown',
    userInitials: initials(r.user.name ?? 'U'),
    latitude: Number(r.latitude),
    longitude: Number(r.longitude),
    accuracy: toNum(r.accuracy),
    distanceFromCustomer: toNum(r.distanceFromCustomer),
    verificationStatus: r.verificationStatus,
    photoUrl: r.photoUrl,
    notes: r.notes,
    createdAt: r.createdAt.toISOString(),
  }))
}

/**
 * Records a check-in against a visit. Photo is uploaded by the caller
 * (actions.ts) and passed as photoUrl. Location is always captured from
 * the device at check-in time and written back to the visit.
 */
export async function createCheckIn(input: {
  visitId: string
  latitude: number
  longitude: number
  accuracy?: number
  notes?: string
  photoUrl?: string | null
}): Promise<Result<{ id: string; verificationStatus: string; distanceFromCustomer: null }>> {
  const session = await requireApiSession()
  const visit = await prisma.fieldVisit.findFirst({
    where: { id: input.visitId, organizationId: session.user.organizationId },
    select: { id: true },
  })
  if (!visit) return err('Visit not found')

  // Geo-fencing is retired — every on-site photo check-in is VERIFIED.
  const verificationStatus = 'VERIFIED'

  const checkIn = await prisma.checkIn.create({
    data: {
      visitId: input.visitId,
      userId: session.user.id,
      latitude: input.latitude,
      longitude: input.longitude,
      accuracy: input.accuracy ?? null,
      distanceFromCustomer: null,
      verificationStatus,
      photoUrl: input.photoUrl ?? null,
      notes: input.notes || null,
    },
  })

  await prisma.fieldVisit.update({
    where: { id: input.visitId },
    data: { status: 'CHECKED_IN', latitude: input.latitude, longitude: input.longitude },
  })

  return ok({ id: checkIn.id, verificationStatus, distanceFromCustomer: null })
}

// ============================================================
// GeoFences
// ============================================================

type GeoFenceRow = Awaited<ReturnType<typeof prisma.geoFence.findMany>>[number] & {
  company: { name: string } | null
}

function mapGeoFence(row: GeoFenceRow): GeoFence {
  return {
    id: row.id,
    name: row.name,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    radius: row.radius,
    companyId: row.companyId,
    companyName: row.company?.name ?? null,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
  }
}

export async function getGeoFences(): Promise<GeoFence[]> {
  const session = await requireApiSession()
  const rows = await prisma.geoFence.findMany({
    where: { organizationId: session.user.organizationId },
    include: { company: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  })
  return rows.map(mapGeoFence)
}

// ============================================================
// Visit Reports
// ============================================================

export async function getVisitReports(): Promise<VisitReport[]> {
  const session = await requireApiSession()
  const rows = await prisma.visitReport.findMany({
    where: { visit: { organizationId: session.user.organizationId } },
    include: {
      visit: { select: { title: true, company: { select: { name: true } } } },
      createdBy: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
  return rows.map((r) => ({
    id: r.id,
    visitId: r.visitId,
    visitTitle: r.visit.title,
    companyName: r.visit.company?.name ?? null,
    createdBy: r.createdBy.name ?? 'Unknown',
    purpose: r.purpose,
    discussion: r.discussion,
    requirements: r.requirements,
    competitorInfo: r.competitorInfo,
    customerFeedback: r.customerFeedback,
    nextSteps: r.nextSteps,
    createdAt: r.createdAt.toISOString(),
  }))
}
