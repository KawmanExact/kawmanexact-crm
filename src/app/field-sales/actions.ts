'use server'

import { validateCsrf } from '@/lib/csrf'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { requireApiSession } from '@/lib/session'
import { PERMISSIONS } from '@/lib/permissions-data'
import { isCloudinaryConfigured, uploadToCloudinary } from '@/lib/cloudinary'
import { findOrCreateCompanyByName } from '@/services/company.service'
import { findOrCreateContactByName } from '@/services/contact.service'
import { createCheckIn as createCheckInRow } from '@/services/field-visit.service'
import { getUserPermissions } from '@/services/permission.service'
import { canManageAssignments } from '@/lib/record-scope'

async function assertPermission(permission: string) {
  const session = await requireApiSession()
  // Live DB check — session.user.permissions is cached for up to 60s
  // via better-auth cookieCache, so a freshly-seeded permission
  // (e.g. field_visits.delete) would otherwise still read as denied
  // until the cookie refreshes or the user re-logs in.
  const live = await getUserPermissions(session.user.id, session.user.organizationId)
  if (!live.includes(permission)) throw new Error('You do not have permission to do this.')
  return session
}

// ============================================================
// Field Visits
// ============================================================

const visitSchema = z.object({
  title: z.string().trim().min(2, 'Title is required'),
  purpose: z.string().trim().min(2, 'Purpose is required'),
  scheduledAt: z.string().trim().min(1, 'Date/time is required'),
  company: z.string().trim().optional(),
  contactName: z.string().trim().optional(),
  contactEmail: z.string().trim().email('Enter a valid email').optional().or(z.literal('')),
  contactMobile: z.string().trim().optional(),
  assigneeId: z.string().trim().optional(),
  address: z.string().trim().optional(),
  // Empty string from the form means "no coordinate" — not 0. Without the
  // preprocess, z.coerce.number() turns "" into 0 (Number("") === 0), so
  // an address-only visit would be saved at 0,0 in the Gulf of Guinea
  // and fail to show where you expect. Treat "" / whitespace / null as undefined.
  // Also normalize comma decimals (19,07 -> 19.07) for locales that type comma.
  latitude: z.preprocess(
    (v) => {
      if (v === '' || v === null || v === undefined) return undefined
      if (typeof v === 'string') {
        const t = v.trim().replace(',', '.')
        if (t === '') return undefined
        return t
      }
      return v
    },
    z.coerce.number().min(-90).max(90).optional()
  ),
  longitude: z.preprocess(
    (v) => {
      if (v === '' || v === null || v === undefined) return undefined
      if (typeof v === 'string') {
        const t = v.trim().replace(',', '.')
        if (t === '') return undefined
        return t
      }
      return v
    },
    z.coerce.number().min(-180).max(180).optional()
  ),
}).refine(
  (data) => {
    const email = data.contactEmail || ''
    const mobile = data.contactMobile || ''
    if (!email.trim() && !mobile.trim()) return true
    return Boolean((data.contactName || '').trim())
  },
  { message: 'Contact name is required when contact email or mobile is provided', path: ['contactName'] },
)

export interface VisitFormState {
  error?: string
  fieldErrors?: Record<string, string>
}

export async function createFieldVisitAction(_prev: VisitFormState, formData: FormData): Promise<VisitFormState> {
  await validateCsrf()
  const session = await assertPermission(PERMISSIONS['field_visits.create'].name)
  const parsed = visitSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] = issue.message
    return { fieldErrors }
  }
  const data = parsed.data
  if (!canManageAssignments(session.user)) data.assigneeId = session.user.id

  const scheduledAt = new Date(data.scheduledAt)
  if (Number.isNaN(scheduledAt.getTime())) {
    return { fieldErrors: { scheduledAt: 'Enter a valid date/time' } }
  }

  const company = data.company?.trim()
    ? await findOrCreateCompanyByName({
        name: data.company.trim(),
        organizationId: session.user.organizationId,
        ownerId: data.assigneeId || session.user.id,
      })
    : null
  const companyId = company?.id ?? null
  const contact = data.contactName?.trim()
    ? await findOrCreateContactByName({
        email: data.contactEmail || null,
        mobile: data.contactMobile || null,
        name: data.contactName.trim(),
        organizationId: session.user.organizationId,
        ownerId: data.assigneeId || session.user.id,
        companyId,
      })
    : null
  const contactId = contact?.id ?? null

  const visit = await prisma.fieldVisit.create({
    data: {
      title: data.title,
      purpose: data.purpose,
      scheduledAt,
      status: 'SCHEDULED',
      address: data.address || null,
      latitude: data.latitude ?? null,
      longitude: data.longitude ?? null,
      organizationId: session.user.organizationId,
      assigneeId: data.assigneeId || session.user.id,
      companyId,
      contactId,
    },
  })

  // Optional photo attached at creation — upload and record as an initial check-in
  // so the Live Map + Check-ins immediately show the visit with proof.
  try {
    const rawPhoto = formData.get('photo')
    const photo = rawPhoto instanceof File && rawPhoto.size > 0 ? rawPhoto : null
    if (photo) {
      const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
      if (allowed.has(photo.type) && photo.size <= 5 * 1024 * 1024 && isCloudinaryConfigured()) {
        const buf = Buffer.from(await photo.arrayBuffer())
        const safe = photo.name.replace(/[\r\n]/g, '').slice(0, 80) || 'visit'
        const up = await uploadToCloudinary(buf, {
          organizationId: session.user.organizationId,
          fileName: `visit-${visit.id}-${Date.now()}-${safe}`,
          mimeType: photo.type,
        })
        const hasLoc = data.latitude != null && data.longitude != null
        await prisma.checkIn.create({
          data: {
            visitId: visit.id,
            userId: session.user.id,
            latitude: data.latitude ?? 0,
            longitude: data.longitude ?? 0,
            accuracy: null,
            distanceFromCustomer: null,
            verificationStatus: hasLoc ? 'VERIFIED' : 'PENDING',
            photoUrl: up.secureUrl,
            notes: hasLoc ? null : 'Photo attached at visit creation (no location).',
          },
        })
        // If we had a live location, reflect it on the visit
        if (hasLoc) {
          await prisma.fieldVisit.update({ where: { id: visit.id }, data: { latitude: data.latitude, longitude: data.longitude } })
        }
      }
    }
  } catch (e) {
    // Non-fatal — visit is already created. Log and continue to redirect.
    console.error('[createFieldVisitAction] photo upload failed:', e)
  }

  // Notify assignee when a leader assigns them a visit — bell + assigned list for face verification
  if (visit.assigneeId !== session.user.id) {
    try {
      const assigner = session.user.name ?? session.user.email ?? 'A team member'
      await prisma.notification.create({
        data: {
          type: 'VISIT_ASSIGNED',
          title: 'New visit assigned to you',
          message: `${assigner} assigned "${visit.title}"${visit.scheduledAt ? ` for ${new Date(visit.scheduledAt).toLocaleString()}` : ''}${data.address ? ` — ${data.address}` : ''}. Open your Assigned visits to verify on-site with a face photo.`,
          data: { visitId: visit.id, assignedById: session.user.id, scheduledAt: visit.scheduledAt.toISOString() },
          organizationId: session.user.organizationId,
          userId: visit.assigneeId,
        },
      })
    } catch (e) {
      console.error('[createFieldVisitAction] VISIT_ASSIGNED notification failed:', e)
    }
  }

  revalidatePath('/field-sales')
  revalidatePath('/field-sales/visits')
  revalidatePath('/field-sales/assigned')
  revalidatePath('/field-sales/checkins')
  revalidatePath('/field-sales/live-map')
  redirect('/field-sales')
}

const VISIT_STATUSES = ['SCHEDULED', 'ON_THE_WAY', 'CHECKED_IN', 'IN_MEETING', 'COMPLETED', 'CANCELLED'] as const

export async function deleteFieldVisitAction(id: string): Promise<{ success?: boolean; error?: string }> {
  await validateCsrf()
  const session = await assertPermission(PERMISSIONS['field_visits.delete'].name)
  const existing = await prisma.fieldVisit.findFirst({ where: { id, organizationId: session.user.organizationId } })
  if (!existing) return { error: 'Visit not found.' }
  // Allow: owner (assignee), creator is not tracked separately, or anyone with field_visits.delete (admin/leader)
  // Org scoping above is the real guard — any delete-capable user in the org may remove it.
  await prisma.fieldVisit.delete({ where: { id } })
  revalidatePath('/field-sales')
  revalidatePath('/field-sales/visits')
  revalidatePath('/field-sales/assigned')
  revalidatePath('/field-sales/checkins')
  revalidatePath('/field-sales/live-map')
  revalidatePath('/field-sales/reports')
  return { success: true }
}

export async function updateVisitStatusAction(visitId: string, status: (typeof VISIT_STATUSES)[number]): Promise<void> {
  await validateCsrf()
  const session = await assertPermission(PERMISSIONS['field_visits.update'].name)
  if (!VISIT_STATUSES.includes(status)) throw new Error('Invalid status')
  const existing = await prisma.fieldVisit.findFirst({ where: { id: visitId, organizationId: session.user.organizationId } })
  if (!existing) return
  await prisma.fieldVisit.update({
    where: { id: visitId },
    data: { status, completedAt: status === 'COMPLETED' ? new Date() : existing.completedAt },
  })
  revalidatePath('/field-sales')
  revalidatePath('/field-sales/visits')
  revalidatePath('/field-sales/live-map')
}

// ============================================================
// Check-ins
// ============================================================

export interface CheckInState {
  error?: string
  success?: boolean
  verificationStatus?: string
}

export async function checkInAction(
  visitId: string,
  coords: { latitude: number; longitude: number; accuracy?: number; notes?: string },
  photo?: File | null
): Promise<CheckInState> {
  await validateCsrf()
  await assertPermission(PERMISSIONS['field_visits.update'].name)

  let photoUrl: string | null = null
  if (photo && photo.size > 0) {
    const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
    if (!allowed.has(photo.type)) return { error: 'Photo must be JPG, PNG, WEBP or GIF.' }
    if (photo.size > 5 * 1024 * 1024) return { error: 'Photo must be under 5MB.' }
    if (!isCloudinaryConfigured()) return { error: 'Image storage is not configured (CLOUDINARY_*).' }
    const session = await requireApiSession()
    const buf = Buffer.from(await photo.arrayBuffer())
    const safe = photo.name.replace(/[\r\n]/g, '').slice(0, 80) || 'checkin'
    const up = await uploadToCloudinary(buf, {
      organizationId: session.user.organizationId,
      fileName: `checkin-${visitId}-${Date.now()}-${safe}`,
      mimeType: photo.type,
    })
    photoUrl = up.secureUrl
  }

  const result = await createCheckInRow({ visitId, ...coords, notes: coords.notes, photoUrl })
  if (!result.success) return { error: result.error }

  revalidatePath('/field-sales')
  revalidatePath('/field-sales/visits')
  revalidatePath('/field-sales/checkins')
  revalidatePath('/field-sales/live-map')
  return { success: true, verificationStatus: result.data.verificationStatus }
}

/** Form-based check-in so file uploads survive Server Actions (photo via multipart). */
export async function checkInWithPhotoAction(_prev: CheckInState, formData: FormData): Promise<CheckInState> {
  const visitId = String(formData.get('visitId') ?? '')
  const lat = Number(formData.get('latitude'))
  const lng = Number(formData.get('longitude'))
  const accRaw = formData.get('accuracy')
  const accuracy = accRaw != null && String(accRaw) !== '' ? Number(accRaw) : undefined
  const notes = String(formData.get('notes') ?? '') || undefined
  const raw = formData.get('photo')
  const photo = raw instanceof File && raw.size > 0 ? raw : null
  if (!visitId) return { error: 'Missing visit.' }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { error: 'Location not captured. Enable location and try again.' }
  return checkInAction(visitId, { latitude: lat, longitude: lng, accuracy, notes }, photo)
}

// ============================================================
// GeoFences
// ============================================================

const geoFenceSchema = z.object({
  name: z.string().trim().min(2, 'Name is required'),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  radius: z.coerce.number().int().min(10, 'Radius must be at least 10m').max(50000),
  company: z.string().trim().optional(),
})

export interface GeoFenceFormState {
  error?: string
  fieldErrors?: Record<string, string>
  success?: boolean
}

export async function createGeoFenceAction(_prev: GeoFenceFormState, formData: FormData): Promise<GeoFenceFormState> {
  await validateCsrf()
  const session = await assertPermission(PERMISSIONS['field_visits.create'].name)
  const parsed = geoFenceSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] = issue.message
    return { fieldErrors }
  }
  const data = parsed.data
  const company2 = data.company?.trim()
    ? await findOrCreateCompanyByName({
        name: data.company.trim(),
        organizationId: session.user.organizationId,
        ownerId: session.user.id,
      })
    : null
  const companyId2 = company2?.id ?? null
  await prisma.geoFence.create({
    data: {
      name: data.name,
      latitude: data.latitude,
      longitude: data.longitude,
      radius: data.radius,
      companyId: companyId2,
      organizationId: session.user.organizationId,
    },
  })
  revalidatePath('/field-sales/geofencing')
  revalidatePath('/field-sales/live-map')
  return { success: true }
}

export async function toggleGeoFenceAction(id: string, isActive: boolean): Promise<void> {
  await validateCsrf()
  const session = await assertPermission(PERMISSIONS['field_visits.update'].name)
  const existing = await prisma.geoFence.findFirst({ where: { id, organizationId: session.user.organizationId } })
  if (!existing) return
  await prisma.geoFence.update({ where: { id }, data: { isActive } })
  revalidatePath('/field-sales/geofencing')
  revalidatePath('/field-sales/live-map')
}

export async function deleteGeoFenceAction(id: string): Promise<void> {
  await validateCsrf()
  const session = await assertPermission(PERMISSIONS['field_visits.update'].name)
  const existing = await prisma.geoFence.findFirst({ where: { id, organizationId: session.user.organizationId } })
  if (!existing) return
  await prisma.geoFence.delete({ where: { id } })
  revalidatePath('/field-sales/geofencing')
  revalidatePath('/field-sales/live-map')
}

// ============================================================
// Visit Reports — manual field report (what was discussed)
// Linked to today's Daily Report + AI daily sales summary
// ============================================================

const visitReportSchema = z.object({
  visitId: z.string().trim().min(1, 'Select a visit'),
  purpose: z.string().trim().min(2, 'Purpose is required').max(2000),
  discussion: z.string().trim().min(10, 'Write what was discussed (min 10 chars)').max(8000),
  requirements: z.string().trim().max(4000).optional(),
  competitorInfo: z.string().trim().max(4000).optional(),
  customerFeedback: z.string().trim().max(4000).optional(),
  nextSteps: z.string().trim().min(3, 'Next steps are required').max(4000),
})

export interface VisitReportFormState {
  error?: string
  fieldErrors?: Record<string, string>
  success?: boolean
  reportId?: string
  dailyReportId?: string
}

function startOfDayLocal(d = new Date()): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export async function createVisitReportAction(
  _prev: VisitReportFormState,
  formData: FormData
): Promise<VisitReportFormState> {
  await validateCsrf()
  const session = await assertPermission(PERMISSIONS['field_visits.create'].name)
  const raw = Object.fromEntries(formData)
  const parsed = visitReportSchema.safeParse(raw)
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] = issue.message
    return { fieldErrors }
  }
  const data = parsed.data

  const visit = await prisma.fieldVisit.findFirst({
    where: { id: data.visitId, organizationId: session.user.organizationId },
    include: { company: { select: { name: true } } },
  })
  if (!visit) return { error: 'Visit not found or not in your organization.' }

  try {
    const report = await prisma.visitReport.create({
      data: {
        visitId: visit.id,
        purpose: data.purpose,
        discussion: data.discussion,
        requirements: data.requirements || null,
        competitorInfo: data.competitorInfo || null,
        customerFeedback: data.customerFeedback || null,
        nextSteps: data.nextSteps,
        createdById: session.user.id,
      },
    })

    // Link to today's DailyReport — create or append so Submit Daily Report already contains field work.
    const today = startOfDayLocal(new Date())
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const fieldSnippet = [
      `Field Visit: ${visit.title}${visit.company?.name ? ` — ${visit.company.name}` : ''}`,
      `Purpose: ${data.purpose}`,
      `Discussion: ${data.discussion}`,
      data.requirements ? `Requirements: ${data.requirements}` : null,
      data.competitorInfo ? `Competitor: ${data.competitorInfo}` : null,
      data.customerFeedback ? `Feedback: ${data.customerFeedback}` : null,
      `Next: ${data.nextSteps}`,
    ]
      .filter(Boolean)
      .join('\n')

    const existingDaily = await prisma.dailyReport.findFirst({
      where: { organizationId: session.user.organizationId, userId: session.user.id, date: { gte: today, lt: tomorrow } },
    })

    let dailyReportId = existingDaily?.id ?? null

    if (!existingDaily) {
      const created = await prisma.dailyReport.create({
        data: {
          organizationId: session.user.organizationId,
          userId: session.user.id,
          date: today,
          status: 'DRAFT',
          workDescription: fieldSnippet,
          completedWork: `Field report — ${visit.title}: ${data.discussion.slice(0, 600)}`,
          pendingWork: data.nextSteps || null,
        },
      })
      dailyReportId = created.id
    } else if (existingDaily.status === 'DRAFT') {
      // Append without overwriting what the rep already wrote — keep both.
      const appendedWork = existingDaily.workDescription
        ? `${existingDaily.workDescription}\n\n---\n${fieldSnippet}`
        : fieldSnippet
      const appendedCompleted = existingDaily.completedWork
        ? `${existingDaily.completedWork}\n• ${visit.title}: ${data.discussion.slice(0, 400)}`
        : `Field report — ${visit.title}: ${data.discussion.slice(0, 600)}`
      // Only fill pending if empty — nextSteps are tomorrow's carry-forward
      const nextPending = existingDaily.pendingWork || data.nextSteps || null
      const updated = await prisma.dailyReport.update({
        where: { id: existingDaily.id },
        data: {
          workDescription: appendedWork.slice(0, 8000),
          completedWork: appendedCompleted.slice(0, 8000),
          pendingWork: nextPending?.slice(0, 5000) ?? null,
        },
      })
      dailyReportId = updated.id
    } else {
      // SUBMITTED daily report exists — don't mutate submitted row; keep visitReport alone.
      // The AI summary will still pull both when requested.
      dailyReportId = existingDaily.id
    }

    revalidatePath('/field-sales/reports')
    revalidatePath('/dashboard/daily-report')
    revalidatePath('/admin/my-team')
    revalidatePath('/admin/my-team/reports')

    return { success: true, reportId: report.id, dailyReportId: dailyReportId ?? undefined }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to save field report' }
  }
}
