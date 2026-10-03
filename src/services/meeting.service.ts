import 'server-only'
import { prisma } from '@/lib/db'
import { requireApiSession } from '@/lib/session'
import { generateCompletion } from '@/lib/ai'
import { uploadToCloudinary } from '@/lib/cloudinary'
import { transcribeVideo } from '@/lib/transcription'
import { queueTranscription } from '@/services/queue.service'
import type { MeetingListItem, MeetingDetail, MeetingType, MeetingStatus } from '@/types/meetings'
import type { Prisma } from '@/generated/prisma'
import { getRecordScope } from '@/lib/record-scope'
import type { Session } from '@/lib/auth'
import { logger } from '@/lib/logger'

/**
 * See lib/record-scope.ts — the base "meetings.view" permission only
 * gates page access, not which rows come back. Meetings have no
 * ownerId (unlike Lead/Company/Contact/Deal), so visibility for a
 * non-admin is "I created it" OR "I'm a participant in it" — a
 * participant obviously needs to see a meeting they were invited to
 * even if a manager/colleague created it.
 *
 * Returns an OR clause for OWN/DEPARTMENT scope, so callers that also
 * build their own OR (search) must combine via `AND: [...]` rather
 * than spreading both into the same object — spreading would let the
 * second OR silently overwrite the first.
 */
function scopeWhere(user: Session['user']): Prisma.MeetingWhereInput {
  const scope = getRecordScope(user)
  if (scope === 'ALL') return {}
  if (scope === 'DEPARTMENT' && user.department?.id) {
    return {
      OR: [
        { createdBy: { departmentId: user.department.id } },
        { participants: { some: { userId: user.id } } },
      ],
    }
  }
  return {
    OR: [
      { createdById: user.id },
      { participants: { some: { userId: user.id } } },
    ],
  }
}

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string')
  return []
}

// ============================================================
// List / detail
// ============================================================

export async function getMeetings(): Promise<MeetingListItem[]> {
  const session = await requireApiSession()
  const orgId = session.user.organizationId

  // Fetch meetings with basic relations
  const rows = await prisma.meeting.findMany({
    where: { organizationId: orgId, ...scopeWhere(session.user) },
    include: {
      company: { select: { name: true } },
      createdBy: { select: { name: true } },
      participants: { select: { id: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  // Fetch related data separately (Prisma doesn't support `take` in `include`)
  const meetingIds = rows.map((r) => r.id)

  const [recordings, transcripts, summaries] = await Promise.all([
    prisma.meetingRecording.findMany({
      where: { meetingId: { in: meetingIds } },
      select: { meetingId: true, id: true },
      distinct: ['meetingId'], // Get only first recording per meeting
    }),
    prisma.meetingTranscript.findMany({
      where: { meetingId: { in: meetingIds } },
      select: { meetingId: true, id: true },
      distinct: ['meetingId'],
    }),
    prisma.meetingSummary.findMany({
      where: { meetingId: { in: meetingIds } },
      select: { meetingId: true, id: true },
      distinct: ['meetingId'],
    }),
  ])

  // Build lookup maps for O(1) access
  const recordingMap = new Map(recordings.map((r) => [r.meetingId, r.id]))
  const transcriptMap = new Map(transcripts.map((t) => [t.meetingId, t.id]))
  const summaryMap = new Map(summaries.map((s) => [s.meetingId, s.id]))

  return rows.map((r) =>
    mapMeetingListItem({
      ...r,
      recordings: recordingMap.has(r.id) ? [{ id: recordingMap.get(r.id)! }] : [],
      transcripts: transcriptMap.has(r.id) ? [{ id: transcriptMap.get(r.id)! }] : [],
      summaries: summaryMap.has(r.id) ? [{ id: summaryMap.get(r.id)! }] : [],
    })
  )
}

function mapMeetingListItem(
  r: Awaited<ReturnType<typeof prisma.meeting.findMany>>[number] & {
    company: { name: string } | null
    createdBy: { name: string | null }
    participants: { id: string }[]
    recordings: { id: string }[]
    transcripts: { id: string }[]
    summaries: { id: string }[]
  }
): MeetingListItem {
  return {
    id: r.id,
    title: r.title,
    type: r.type as MeetingType,
    status: r.status as MeetingStatus,
    scheduledAt: r.scheduledAt?.toISOString() ?? new Date().toISOString(),
    createdAt: r.createdAt.toISOString(),
    duration: r.duration,
    companyName: r.company?.name ?? null,
    createdBy: r.createdBy.name ?? 'Unknown',
    participantCount: r.participants.length,
    hasRecording: r.recordings.length > 0,
    hasTranscript: r.transcripts.length > 0,
    hasSummary: r.summaries.length > 0,
  }
}

export type MeetingSortKey = 'scheduledAt' | 'title' | 'createdAt'

export interface MeetingQuery {
  search?: string
  status?: MeetingStatus
  sortKey?: MeetingSortKey
  sortDir?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}

export interface MeetingPage {
  meetings: MeetingListItem[]
  total: number
  page: number
  pageSize: number
  pageCount: number
}

const MEETING_SORT_FIELD: Record<MeetingSortKey, string> = {
  scheduledAt: 'scheduledAt',
  title: 'title',
  createdAt: 'createdAt',
}

/**
 * Server-side paginated + searched + sorted meeting listing for the main
 * /meetings list page — mirrors services/lead.service.ts#getLeadsPage.
 *
 * Kept separate from getMeetings() above rather than replacing it:
 * getMeetings() is also used by /meetings/videos and /meetings/mom,
 * which each want the FULL set to filter client-side.
 */
export async function getMeetingsPage(q: MeetingQuery): Promise<MeetingPage> {
  const session = await requireApiSession()
  const orgId = session.user.organizationId
  const page = q.page ?? 1
  const pageSize = q.pageSize ?? 20
  const sortKey = q.sortKey ?? 'createdAt'
  const sortDir = q.sortDir ?? 'desc'

  const where: Prisma.MeetingWhereInput = {
    organizationId: orgId,
    AND: [
      scopeWhere(session.user),
      ...(q.search
        ? [{
            OR: [
              { title: { contains: q.search, mode: 'insensitive' as const } },
              { notes: { contains: q.search, mode: 'insensitive' as const } },
              { company: { name: { contains: q.search, mode: 'insensitive' as const } } },
            ],
          }]
        : []),
    ],
    ...(q.status && { status: q.status }),
  }

  const [rows, total] = await Promise.all([
    prisma.meeting.findMany({
      where,
      include: {
        company: { select: { name: true } },
        createdBy: { select: { name: true } },
        participants: { select: { id: true } },
      },
      orderBy: { [MEETING_SORT_FIELD[sortKey]]: sortDir },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.meeting.count({ where }),
  ])

  // Fetch related data separately (Prisma doesn't support `take` in `include`)
  const meetingIds = rows.map((r) => r.id)

  const [recordings, transcripts, summaries] = await Promise.all([
    prisma.meetingRecording.findMany({
      where: { meetingId: { in: meetingIds } },
      select: { meetingId: true, id: true },
      distinct: ['meetingId'],
    }),
    prisma.meetingTranscript.findMany({
      where: { meetingId: { in: meetingIds } },
      select: { meetingId: true, id: true },
      distinct: ['meetingId'],
    }),
    prisma.meetingSummary.findMany({
      where: { meetingId: { in: meetingIds } },
      select: { meetingId: true, id: true },
      distinct: ['meetingId'],
    }),
  ])

  const recordingMap = new Map(recordings.map((r) => [r.meetingId, r.id]))
  const transcriptMap = new Map(transcripts.map((t) => [t.meetingId, t.id]))
  const summaryMap = new Map(summaries.map((s) => [s.meetingId, s.id]))

  return {
    meetings: rows.map((r) =>
      mapMeetingListItem({
        ...r,
        recordings: recordingMap.has(r.id) ? [{ id: recordingMap.get(r.id)! }] : [],
        transcripts: transcriptMap.has(r.id) ? [{ id: transcriptMap.get(r.id)! }] : [],
        summaries: summaryMap.has(r.id) ? [{ id: summaryMap.get(r.id)! }] : [],
      })
    ),
    total,
    page,
    pageSize,
    pageCount: Math.ceil(total / pageSize),
  }
}

export async function getMeetingById(id: string): Promise<MeetingDetail | null> {
  const session = await requireApiSession()
  const orgId = session.user.organizationId

  // Fetch meeting with basic relations
  const row = await prisma.meeting.findFirst({
    where: { id, organizationId: orgId, ...scopeWhere(session.user) },
    include: {
      company: { select: { name: true } },
      contact: { select: { name: true } },
      deal: { select: { name: true } },
      createdBy: { select: { name: true } },
      participants: { include: { user: { select: { name: true } } } },
      recordings: { orderBy: { createdAt: 'desc' } },
      transcripts: { orderBy: { createdAt: 'desc' } },
    },
  })
  if (!row) return null

  // Fetch latest summary and transcript separately (Prisma doesn't support `take` in `include`)
  const [latestSummary, latestTranscript] = await Promise.all([
    prisma.meetingSummary.findFirst({
      where: { meetingId: id },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.meetingTranscript.findFirst({
      where: { meetingId: id },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  return {
    id: row.id,
    title: row.title,
    type: row.type as MeetingType,
    status: row.status as MeetingStatus,
    scheduledAt: row.scheduledAt?.toISOString() ?? new Date().toISOString(),
    duration: row.duration,
    location: row.location,
    meetingLink: row.meetingLink,
    notes: row.notes,
    companyName: row.company?.name ?? null,
    contactName: row.contact?.name ?? null,
    dealName: row.deal?.name ?? null,
    createdBy: row.createdBy.name ?? 'Unknown',
    participants: row.participants.map((p) => ({ id: p.id, name: p.user.name ?? 'Unknown', role: p.role })),
    recordings: row.recordings.map((rec) => ({
      id: rec.id,
      secureUrl: rec.secureUrl,
      duration: rec.duration,
      fileSize: rec.fileSize != null ? rec.fileSize.toString() : null,
      createdAt: rec.createdAt.toISOString(),
    })),
    transcript: latestTranscript
      ? { id: latestTranscript.id, content: latestTranscript.content, language: latestTranscript.language, createdAt: latestTranscript.createdAt.toISOString() }
      : null,
    summary: latestSummary
      ? {
          id: latestSummary.id,
          summary: latestSummary.summary,
          discussionPoints: asStringArray(latestSummary.discussionPoints),
          requirements: asStringArray(latestSummary.requirements),
          objections: asStringArray(latestSummary.objections),
          buyingSignals: asStringArray(latestSummary.buyingSignals),
          riskSignals: asStringArray(latestSummary.riskSignals),
          actionItems: asStringArray(latestSummary.actionItems),
          nextSteps: asStringArray(latestSummary.nextSteps),
          isEdited: latestSummary.isEdited,
          createdAt: latestSummary.createdAt.toISOString(),
        }
      : null,
  }
}

// ============================================================
// Transcript
// ============================================================

export async function saveTranscript(meetingId: string, content: string) {
  const session = await requireApiSession()
  const meeting = await prisma.meeting.findFirst({ where: { id: meetingId, organizationId: session.user.organizationId } })
  if (!meeting) throw new Error('Meeting not found')

  const existing = await prisma.meetingTranscript.findFirst({ where: { meetingId }, orderBy: { createdAt: 'desc' } })
  if (existing) {
    await prisma.meetingTranscript.update({ where: { id: existing.id }, data: { content } })
  } else {
    await prisma.meetingTranscript.create({ data: { meetingId, content } })
  }
}

// ============================================================
// Recording (manual link — full Cloudinary upload lands with the
// file-management feature; this stores whatever secure URL you have)
// ============================================================

export async function addRecordingLink(meetingId: string, secureUrl: string, duration?: number) {
  const session = await requireApiSession()
  const meeting = await prisma.meeting.findFirst({ where: { id: meetingId, organizationId: session.user.organizationId } })
  if (!meeting) throw new Error('Meeting not found')

  await prisma.meetingRecording.create({
    data: {
      meetingId,
      cloudinaryPublicId: `manual-${meetingId}-${Date.now()}`,
      secureUrl,
      duration: duration ?? null,
    },
  })
}

// ============================================================
// AI-generated Minutes of Meeting
// ============================================================

const MOM_SYSTEM_PROMPT = `You are an assistant that writes precise Minutes of Meeting (MoM) for B2B sales and customer meetings at Kawman ExAct, a nutraceutical ingredients company. You will be given a meeting transcript or notes. Respond with ONLY a single JSON object (no markdown fences, no commentary) with exactly these keys:
{
  "summary": "2-4 sentence plain-English summary of the meeting",
  "discussionPoints": ["short bullet", ...],
  "requirements": ["customer requirement or spec mentioned", ...],
  "objections": ["objection or concern raised", ...],
  "buyingSignals": ["positive signal indicating purchase intent", ...],
  "riskSignals": ["signal indicating risk of losing the deal", ...],
  "actionItems": ["concrete action item, ideally with an owner", ...],
  "nextSteps": ["next step in the sales process", ...]
}
Use empty arrays for any category with nothing relevant. Keep each bullet under 20 words. Do not invent details not present in the source text.`

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced) return fenced[1].trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start !== -1 && end !== -1 && end > start) return text.slice(start, end + 1)
  return text.trim()
}

/**
 * Generates a structured MoM from the meeting's transcript (falling back to
 * its free-text notes if no transcript has been added yet) via the
 * configured AI provider, and upserts it as the meeting's MeetingSummary.
 */
export async function generateMeetingSummary(meetingId: string, organizationId?: string) {
  const orgId = organizationId ?? (await requireApiSession()).user.organizationId
  const meeting = await prisma.meeting.findFirst({
    where: { id: meetingId, organizationId: orgId },
    include: { transcripts: { orderBy: { createdAt: 'desc' } } },
  })
  if (!meeting) throw new Error('Meeting not found')

  // Get the latest transcript (Prisma doesn't support `take` in `include`)
  const latestTranscript = meeting.transcripts[0]
  const sourceText = latestTranscript?.content?.trim() || meeting.notes?.trim()
  if (!sourceText) {
    throw new Error('Add a transcript or notes before generating the MoM')
  }

  const raw = await generateCompletion(
    [{ role: 'user', content: `Meeting title: ${meeting.title}\n\nTranscript/notes:\n${sourceText}` }],
    MOM_SYSTEM_PROMPT
  )

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(extractJson(raw))
  } catch {
    throw new Error('AI response could not be parsed. Try generating again.')
  }

  const data = {
    summary: typeof parsed.summary === 'string' ? parsed.summary : '',
    discussionPoints: asStringArray(parsed.discussionPoints),
    requirements: asStringArray(parsed.requirements),
    objections: asStringArray(parsed.objections),
    buyingSignals: asStringArray(parsed.buyingSignals),
    riskSignals: asStringArray(parsed.riskSignals),
    actionItems: asStringArray(parsed.actionItems),
    nextSteps: asStringArray(parsed.nextSteps),
  }

  const existing = await prisma.meetingSummary.findFirst({ where: { meetingId } })
  if (existing) {
    await prisma.meetingSummary.update({
      where: { id: existing.id },
      data: { ...data, isEdited: false, editedById: null },
    })
  } else {
    await prisma.meetingSummary.create({ data: { meetingId, ...data } })
  }

  // Video-upload flow creates the meeting as PROCESSING — once a MoM
  // exists the pipeline is done, so flip to COMPLETED instead of
  // leaving the card stuck on "Processing video…" forever.
  if (meeting.status === 'PROCESSING') {
    await prisma.meeting.update({ where: { id: meetingId }, data: { status: 'COMPLETED' } }).catch(() => {})
  }
}

export async function updateMeetingSummaryText(meetingId: string, summary: string) {
  const session = await requireApiSession()
  const meeting = await prisma.meeting.findFirst({ where: { id: meetingId, organizationId: session.user.organizationId } })
  if (!meeting) throw new Error('Meeting not found')
  const existing = await prisma.meetingSummary.findFirst({ where: { meetingId } })
  if (!existing) throw new Error('No MoM to edit yet')
  await prisma.meetingSummary.update({
    where: { id: existing.id },
    data: { summary, isEdited: true, editedById: session.user.id },
  })
}

/**
 * Uploads a meeting video to Cloudinary, creates a MeetingRecording,
 * extracts audio, transcribes it, and generates the MoM.
 * This runs as a background process - the meeting status is set to PROCESSING
 * and updated to COMPLETED or FAILED when done.
 */
export async function processMeetingVideoBackground(meetingId: string, videoBuffer: Buffer, fileName: string, mimeType: string, organizationId: string) {
  const orgId = organizationId

  try {
    // 1. Upload video to Cloudinary
    const uploadResult = await uploadToCloudinary(videoBuffer, {
      organizationId: orgId,
      fileName,
      mimeType,
    })

    // 2. Create MeetingRecording
    await prisma.meetingRecording.create({
      data: {
        meetingId,
        cloudinaryPublicId: uploadResult.publicId,
        secureUrl: uploadResult.secureUrl,
        fileSize: BigInt(uploadResult.fileSize),
        duration: null,
      },
    })

    // 3. Extract audio and transcribe
    const transcriptText = await transcribeVideo(uploadResult.secureUrl)
    
    if (transcriptText) {
      // 4. Save transcript
      await prisma.meetingTranscript.create({
        data: {
          meetingId,
          content: transcriptText,
        },
      })

       // 5. Generate MoM from transcript
      await generateMeetingSummary(meetingId, orgId)
    }

    // 6. Update meeting status to COMPLETED
    await prisma.meeting.update({
      where: { id: meetingId },
      data: { status: 'COMPLETED' },
    })

    return { success: true }
  } catch (error) {
    logger.error('Video processing failed', {}, error as Error)

    // Update meeting status to FAILED
    await prisma.meeting.update({
      where: { id: meetingId },
      data: { status: 'FAILED' },
    }).catch(() => {}) // Ignore update errors

    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

/**
 * Transcribes a meeting video and generates the MoM.
 * Used both by the BullMQ transcription worker and as a fallback
 * (via setTimeout) when Redis is not available.
 */
export async function processTranscription(meetingId: string, videoUrl: string, organizationId: string) {
  try {
    const transcript = await transcribeVideo(videoUrl)

    if (transcript) {
      await prisma.meetingTranscript.create({
        data: {
          meetingId,
          content: transcript,
          language: 'en',
        },
      })

      await generateMeetingSummary(meetingId, organizationId)
    }

    await prisma.meeting.update({ where: { id: meetingId }, data: { status: 'COMPLETED' } }).catch(() => {})
  } catch (err) {
    console.error('[TRANSCRIPTION] Failed:', err)
    await prisma.meeting.update({ where: { id: meetingId }, data: { status: 'FAILED' } }).catch(() => {})
  }
}

/**
 * Creates a meeting with a video upload and starts background processing.
 * Returns the meeting ID immediately so the UI can redirect.
 */
export async function createMeetingWithVideo(
  data: {
    title: string
    companyId?: string
    contactId?: string
    dealId?: string
    participantIds?: string[]
    notes?: string
    videoBuffer: Buffer
    fileName: string
    mimeType: string
  }
) {
  const session = await requireApiSession()
  const orgId = session.user.organizationId

  // Create meeting with PROCESSING status
  const meeting = await prisma.meeting.create({
    data: {
      organizationId: orgId,
      title: data.title,
      type: 'VIDEO_CALL', // Default type for uploaded videos
      status: 'PROCESSING',
      scheduledAt: new Date(), // Default to now
      duration: 0,
      companyId: data.companyId,
      contactId: data.contactId,
      dealId: data.dealId,
      notes: data.notes,
      createdById: session.user.id,
      participants: data.participantIds?.length
        ? { connect: data.participantIds.map((id) => ({ id })) }
        : undefined,
    },
  })

  // Upload to Cloudinary and create recording record first
  const uploadResult = await uploadToCloudinary(data.videoBuffer, {
    organizationId: orgId,
    fileName: data.fileName,
    mimeType: data.mimeType,
  })

  await prisma.meetingRecording.create({
    data: {
      meetingId: meeting.id,
      cloudinaryPublicId: uploadResult.publicId,
      secureUrl: uploadResult.secureUrl,
      fileSize: BigInt(uploadResult.fileSize),
      duration: null,
    },
  })

  // Queue transcription in the background (never blocks the caller)
  const queued = await queueTranscription({
    meetingId: meeting.id,
    recordingId: '',
    videoUrl: uploadResult.secureUrl,
    organizationId: orgId,
  })
  if (!queued) {
    setTimeout(() => {
      void processTranscription(meeting.id, uploadResult.secureUrl, orgId)
        .catch((err) => logger.error('Background transcription error', {}, err as Error))
    }, 0)
  }

  return meeting
}

/**
 * Retry video processing for a failed meeting
 */
export async function retryMeetingVideoProcessing(meetingId: string) {
  const session = await requireApiSession()
  const orgId = session.user.organizationId

  const meeting = await prisma.meeting.findFirst({
    where: { id: meetingId, organizationId: orgId },
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

  // Queue transcription in the background — the video is already on
  // Cloudinary, so the worker fetches it directly by URL.
  const queued = await queueTranscription({
    meetingId,
    recordingId: recording.id,
    videoUrl: recording.secureUrl,
    organizationId: orgId,
  })
  if (!queued) {
    setTimeout(() => {
      void processTranscription(meetingId, recording.secureUrl, orgId)
        .catch((err) => logger.error('Retry processing error', {}, err as Error))
    }, 0)
  }

  return { success: true }
}