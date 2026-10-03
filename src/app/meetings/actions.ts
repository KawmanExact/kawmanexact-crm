'use server'

import { validateCsrf } from '@/lib/csrf'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { after } from 'next/server'
import { prisma } from '@/lib/db'
import { requireApiSession } from '@/lib/session'
import { PERMISSIONS } from '@/lib/permissions-data'
import { saveTranscript, addRecordingLink, generateMeetingSummary, updateMeetingSummaryText, processTranscription } from '@/services/meeting.service'
import { validateCloudinaryVideoUpload } from '@/lib/cloudinary'
import { findOrCreateCompanyByName } from '@/services/company.service'
import { findOrCreateContactByName } from '@/services/contact.service'
import { logAudit } from '@/lib/audit-log'
import { queueTranscription } from '@/services/queue.service'

async function assertPermission(permission: string) {
  const session = await requireApiSession()
  if (!(session.user.permissions as string[]).includes(permission)) throw new Error('You do not have permission to do this.')
  return session
}

// ============================================================
// Create meeting (video upload flow)
// ============================================================

const meetingSchema = z.object({
  title: z.string().trim().min(2, 'Title is required'),
  notes: z.string().trim().optional(),
  company: z.string().trim().optional(),
  contactName: z.string().trim().optional(),
  contactEmail: z.string().trim().email('Enter a valid email').optional().or(z.literal('')),
  contactMobile: z.string().trim().optional(),
  dealId: z.string().trim().optional(),
  participantIds: z.string().trim().optional(),
}).refine(
  (data) => {
    const email = data.contactEmail || ''
    const mobile = data.contactMobile || ''
    if (!email.trim() && !mobile.trim()) return true
    return Boolean((data.contactName || '').trim())
  },
  { message: 'Contact name is required when contact email or mobile is provided', path: ['contactName'] },
)

export interface MeetingFormState {
  error?: string
  fieldErrors?: Record<string, string>
}

export async function createMeetingAction(_prev: MeetingFormState, formData: FormData): Promise<MeetingFormState> {
  await validateCsrf()
  const session = await assertPermission(PERMISSIONS['meetings.create'].name)
  const parsed = meetingSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] = issue.message
    return { fieldErrors }
  }
  const data = parsed.data

  const participantIds = data.participantIds
    ? Array.from(new Set(data.participantIds.split(',').map((s) => s.trim()).filter(Boolean)))
    : []
  if (!participantIds.includes(session.user.id)) participantIds.push(session.user.id)

  const company = data.company?.trim()
    ? await findOrCreateCompanyByName({
        name: data.company.trim(),
        organizationId: session.user.organizationId,
        ownerId: session.user.id,
      })
    : null
  const companyId = company?.id ?? null
  const contact = data.contactName?.trim()
    ? await findOrCreateContactByName({
        email: data.contactEmail || null,
        mobile: data.contactMobile || null,
        name: data.contactName.trim(),
        organizationId: session.user.organizationId,
        ownerId: session.user.id,
        companyId,
      })
    : null
  const contactId = contact?.id ?? null

  const meeting = await prisma.meeting.create({
    data: {
      title: data.title,
      type: 'VIDEO_CALL',
      status: 'SCHEDULED',
      scheduledAt: new Date(),
      duration: 0,
      notes: data.notes || null,
      organizationId: session.user.organizationId,
      createdById: session.user.id,
      companyId,
      contactId,
      dealId: data.dealId || null,
      participants: {
        create: participantIds.map((userId) => ({
          userId,
          role: userId === session.user.id ? 'ORGANIZER' : 'PARTICIPANT',
        })),
      },
    },
  })

  await logAudit({
    organizationId: session.user.organizationId,
    actorId: session.user.id,
    action: 'CREATE',
    resource: 'Meeting',
    resourceId: meeting.id,
    metadata: { title: meeting.title, type: meeting.type },
  })

  revalidatePath('/meetings')
  redirect(`/meetings/${meeting.id}`)
}

const MEETING_STATUSES = ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'PROCESSING', 'FAILED'] as const

export async function updateMeetingStatusAction(meetingId: string, status: (typeof MEETING_STATUSES)[number]): Promise<void> {
  await validateCsrf()
  const session = await assertPermission(PERMISSIONS['meetings.update'].name)
  if (!MEETING_STATUSES.includes(status)) throw new Error('Invalid status')
  const existing = await prisma.meeting.findFirst({ where: { id: meetingId, organizationId: session.user.organizationId } })
  if (!existing) return
  await prisma.meeting.update({
    where: { id: meetingId },
    data: {
      status,
      startedAt: status === 'IN_PROGRESS' && !existing.startedAt ? new Date() : existing.startedAt,
      endedAt: status === 'COMPLETED' ? new Date() : existing.endedAt,
    },
  })
  revalidatePath(`/meetings/${meetingId}`)
  revalidatePath('/meetings')
}

export interface SimpleActionState {
  error?: string
  success?: boolean
}

export async function renameMeetingAction(meetingId: string, title: string): Promise<SimpleActionState> {
  try {
    await validateCsrf()
    const session = await assertPermission(PERMISSIONS['meetings.update'].name)
    const t = title.trim()
    if (t.length < 2) return { error: 'Title must be at least 2 characters' }
    const existing = await prisma.meeting.findFirst({ where: { id: meetingId, organizationId: session.user.organizationId } })
    if (!existing) return { error: 'Meeting not found' }
    await prisma.meeting.update({ where: { id: meetingId }, data: { title: t } })
    await logAudit({ organizationId: session.user.organizationId, actorId: session.user.id, action: 'UPDATE', resource: 'Meeting', resourceId: meetingId, metadata: { title: t } })
    revalidatePath(`/meetings/${meetingId}`)
    revalidatePath('/meetings')
    revalidatePath('/meetings/mom')
    revalidatePath('/meetings/videos')
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to rename meeting' }
  }
}

export async function deleteMeetingAction(meetingId: string): Promise<SimpleActionState> {
  try {
    await validateCsrf()
    const session = await assertPermission(PERMISSIONS['meetings.delete'].name)
    const existing = await prisma.meeting.findFirst({ where: { id: meetingId, organizationId: session.user.organizationId } })
    if (!existing) return { error: 'Meeting not found' }
    await prisma.meeting.delete({ where: { id: meetingId } })
    await logAudit({ organizationId: session.user.organizationId, actorId: session.user.id, action: 'DELETE', resource: 'Meeting', resourceId: meetingId, metadata: { title: existing.title } })
    revalidatePath('/meetings')
    revalidatePath('/meetings/mom')
    revalidatePath('/meetings/videos')
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to delete meeting' }
  }
}

export async function deleteMomAction(meetingId: string): Promise<SimpleActionState> {
  try {
    await validateCsrf()
    const session = await assertPermission(PERMISSIONS['meetings.update'].name)
    const meeting = await prisma.meeting.findFirst({ where: { id: meetingId, organizationId: session.user.organizationId } })
    if (!meeting) return { error: 'Meeting not found' }
    const existing = await prisma.meetingSummary.findFirst({ where: { meetingId } })
    if (!existing) return { error: 'No MoM to delete' }
    await prisma.meetingSummary.delete({ where: { id: existing.id } })
    await logAudit({ organizationId: session.user.organizationId, actorId: session.user.id, action: 'DELETE', resource: 'MeetingSummary', resourceId: existing.id, metadata: { meetingId } })
    revalidatePath(`/meetings/${meetingId}`)
    revalidatePath('/meetings/mom')
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to delete MoM' }
  }
}

// ============================================================
// Transcript
// ============================================================

export async function saveTranscriptAction(meetingId: string, content: string): Promise<SimpleActionState> {
  try {
    await validateCsrf()
    await assertPermission(PERMISSIONS['meetings.update'].name)
    if (!content.trim()) return { error: 'Transcript cannot be empty' }
    await saveTranscript(meetingId, content.trim())
    revalidatePath(`/meetings/${meetingId}`)
    revalidatePath('/meetings/mom')
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to save transcript' }
  }
}

// ============================================================
// Recording link
// ============================================================

export async function addRecordingLinkAction(meetingId: string, secureUrl: string, duration?: number): Promise<SimpleActionState> {
  try {
    await validateCsrf()
    await assertPermission(PERMISSIONS['meetings.update'].name)
    if (!secureUrl.trim()) return { error: 'A video URL is required' }
    await addRecordingLink(meetingId, secureUrl.trim(), duration)
    revalidatePath(`/meetings/${meetingId}`)
    revalidatePath('/meetings/videos')
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to add recording' }
  }
}

// ============================================================
// AI MoM
// ============================================================

export async function generateMomAction(meetingId: string): Promise<SimpleActionState> {
  try {
    await validateCsrf()
    await assertPermission(PERMISSIONS['meetings.update'].name)
    await generateMeetingSummary(meetingId)
    revalidatePath(`/meetings/${meetingId}`)
    revalidatePath('/meetings/mom')
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to generate MoM' }
  }
}

export async function editMomSummaryAction(meetingId: string, summary: string): Promise<SimpleActionState> {
  try {
    await validateCsrf()
    await assertPermission(PERMISSIONS['meetings.update'].name)
    if (!summary.trim()) return { error: 'Summary cannot be empty' }
    await updateMeetingSummaryText(meetingId, summary.trim())
    revalidatePath(`/meetings/${meetingId}`)
    revalidatePath('/meetings/mom')
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to update MoM' }
  }
}

// ============================================================
// Background transcription + MoM
// ============================================================

async function scheduleTranscription(
  meetingId: string,
  recordingId: string,
  videoUrl: string,
  organizationId: string,
): Promise<void> {
  const queued = await queueTranscription({ meetingId, recordingId, videoUrl, organizationId })
  if (!queued) {
    // Redis not available — defer with setTimeout so the HTTP response
    // flushes before any work begins. Callers MUST invoke this from within an
    // `after()` callback (or otherwise keep the request alive), so the
    // serverless invocation isn't torn down before the deferred task runs.
    setTimeout(() => {
      processTranscription(meetingId, videoUrl, organizationId).catch((err) => {
        console.error('[MEETING] Background transcription failed:', err)
      })
    }, 0)
  }
}

// ============================================================
// Create meeting with video upload
// ============================================================

export interface CreateMeetingWithVideoState {
  error?: string
  fieldErrors?: Record<string, string>
  meetingId?: string
}

export async function createMeetingWithVideoAction(
  _prev: CreateMeetingWithVideoState,
  formData: FormData
): Promise<CreateMeetingWithVideoState> {
  await validateCsrf()
  const session = await assertPermission(PERMISSIONS['meetings.create'].name)

  const title = formData.get('title')?.toString().trim() || ''
  const notes = formData.get('notes')?.toString().trim()
  const companyName = formData.get('company')?.toString().trim() || undefined
  const contactName = formData.get('contactName')?.toString().trim() || undefined
  const contactEmail = formData.get('contactEmail')?.toString().trim() || undefined
  const dealId = formData.get('dealId')?.toString().trim() || undefined
  const participantIds = formData.get('participantIds')?.toString().trim()
  const videoUrl = formData.get('videoUrl')?.toString().trim() || ''
  const videoPublicId = formData.get('videoPublicId')?.toString().trim() || ''
  const videoBytesRaw = formData.get('videoBytes')?.toString().trim() || ''
  const videoBytes = Number(videoBytesRaw)

  // The video itself was uploaded straight to Cloudinary by the browser via a
  // signed (chunked) upload to dodge Vercel's 4.5MB request-body limit. The
  // server only receives the resulting URL, public id and byte count. Those
  // values are client-controlled, so re-validate them server-side: the
  // secure_url must point at our Cloudinary account, the public id must live
  // under this org's folder, and the byte count must be non-zero and within
  // the 500MB cap.
  const fieldErrors: Record<string, string> = {}
  if (!title || title.length < 2) {
    fieldErrors.title = 'Title is required (minimum 2 characters)'
  }
  const uploadError = validateCloudinaryVideoUpload(videoUrl, videoPublicId, videoBytes, session.user.organizationId)
  if (uploadError) {
    fieldErrors.videoFile = uploadError
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors }
  }

  const participantIdsArray = participantIds
    ? Array.from(new Set(participantIds.split(',').map((s) => s.trim()).filter(Boolean)))
    : []
  if (!participantIdsArray.includes(session.user.id)) participantIdsArray.push(session.user.id)

  const company = companyName
    ? await findOrCreateCompanyByName({
        name: companyName,
        organizationId: session.user.organizationId,
        ownerId: session.user.id,
      })
    : null
  const companyId = company?.id ?? null
  const contact = contactName
    ? await findOrCreateContactByName({
        email: contactEmail || null,
        mobile: formData.get('contactMobile')?.toString().trim() || null,
        name: contactName,
        organizationId: session.user.organizationId,
        ownerId: session.user.id,
        companyId,
      })
    : null
  const contactId = contact?.id ?? null

  // Create meeting with PROCESSING status — the page already shows a
  // "Processing…" state while status === PROCESSING.
  const meeting = await prisma.meeting.create({
    data: {
      organizationId: session.user.organizationId,
      title,
      type: 'VIDEO_CALL',
      status: 'PROCESSING',
      scheduledAt: new Date(),
      duration: 0,
      companyId,
      contactId,
      dealId: dealId || null,
      notes: notes || null,
      createdById: session.user.id,
      // participantIdsArray holds User IDs. Meeting.participants is the
      // MeetingParticipant junction table (its own `id`, distinct from
      // userId) — there's no existing junction row to `connect` yet, so
      // this must `create` new MeetingParticipant rows, same as
      // createMeetingAction above does for the non-video flow.
      participants: participantIdsArray.length
        ? {
            create: participantIdsArray.map((userId) => ({
              userId,
              role: userId === session.user.id ? 'ORGANIZER' : 'PARTICIPANT',
            })),
          }
        : undefined,
    },
  })

  await logAudit({
    organizationId: session.user.organizationId,
    actorId: session.user.id,
    action: 'CREATE',
    resource: 'Meeting',
    resourceId: meeting.id,
    metadata: { title: meeting.title, type: meeting.type, status: meeting.status, hasVideo: true },
  })

  await prisma.meetingRecording.create({
    data: {
      meetingId: meeting.id,
      cloudinaryPublicId: videoPublicId,
      secureUrl: videoUrl,
      duration: null,
      fileSize: BigInt(videoBytes),
    },
  })

  // Transcription + MoM generation can take minutes on long videos; defer it
  // to AFTER the response is sent, inside `after()` so the serverless
  // invocation stays alive (Vercel extends it via waitUntil).
  after(async () => {
    try {
      await scheduleTranscription(meeting.id, '', videoUrl, session.user.organizationId)
    } catch (err) {
      console.error('[MEETING] Background transcription failed:', err)
      await prisma.meeting.update({ where: { id: meeting.id }, data: { status: 'FAILED' } }).catch(() => {})
    }
  })

  revalidatePath('/meetings')
  revalidatePath('/meetings/videos')

  return { meetingId: meeting.id }
}

// ============================================================
// Retry video processing
// ============================================================

export async function retryMeetingVideoProcessingAction(meetingId: string) {
  await validateCsrf()
  const session = await assertPermission(PERMISSIONS['meetings.update'].name)

  const meeting = await prisma.meeting.findFirst({
    where: { id: meetingId, organizationId: session.user.organizationId },
    include: { recordings: { take: 1 } },
  })

  if (!meeting) throw new Error('Meeting not found')
  if (meeting.status !== 'FAILED') throw new Error('Meeting is not in FAILED status')
  if (!meeting.recordings.length) throw new Error('No recording to retry')

  const recording = meeting.recordings[0]

  // Update status to PROCESSING
  await prisma.meeting.update({
    where: { id: meetingId },
    data: { status: 'PROCESSING' },
  })

  // Queue transcription in the background (never await — would block the
  // server action response for minutes on long videos). Run inside `after()`
  // so the no-Redis setTimeout fallback stays alive on a serverless runtime.
  after(async () => {
    try {
      await scheduleTranscription(meetingId, '', recording.secureUrl, session.user.organizationId)
    } catch (err) {
      console.error('[MEETING] Background transcription failed:', err)
      await prisma.meeting.update({ where: { id: meetingId }, data: { status: 'FAILED' } }).catch(() => {})
    }
  })

  revalidatePath(`/meetings/${meetingId}`)
  revalidatePath('/meetings')

  return { success: true }
}
