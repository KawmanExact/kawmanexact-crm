import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { validateCloudinaryVideoUpload } from '@/lib/cloudinary'
import { checkRateLimit } from '@/lib/rate-limit'
import { queueTranscription } from '@/services/queue.service'
import { processTranscription } from '@/services/meeting.service'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Permission gate — only users who can update meetings may attach recordings
    if (!(session.user.permissions as string[]).includes('meetings.update') && !(session.user.permissions as string[]).includes('meetings.create')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const limit = await checkRateLimit(`meeting-upload:${session.user.id}`, 5, 60)
    if (!limit.allowed) {
      return NextResponse.json(
        { error: 'Too many uploads. Please slow down.' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
      )
    }

    const { id: meetingId } = await params

    const meeting = await prisma.meeting.findFirst({
      where: { id: meetingId, organizationId: session.user.organizationId },
      select: { id: true, organizationId: true },
    })

    if (!meeting) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 })
    }

    // The video was uploaded directly to Cloudinary by the browser via a signed
    // (chunked) upload, to dodge Vercel's 4.5MB request-body limit. The body
    // here is small JSON — only the resulting URL, public id and byte count.
    // These values are client-controlled, so re-validate them server-side
    // before trusting them (see step 4 of the direct-upload change).
    const body = (await request.json().catch(() => null)) as
      | { secureUrl?: string; publicId?: string; bytes?: number }
      | null

    if (!body) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const secureUrl = body.secureUrl?.trim() || ''
    const publicId = body.publicId?.trim() || ''
    const bytes = Number(body.bytes)

    const uploadError = validateCloudinaryVideoUpload(secureUrl, publicId, bytes, session.user.organizationId)
    if (uploadError) {
      return NextResponse.json({ error: uploadError }, { status: 400 })
    }

    const recording = await prisma.meetingRecording.create({
      data: {
        meetingId,
        cloudinaryPublicId: publicId,
        secureUrl,
        duration: null,
        fileSize: BigInt(bytes),
      },
    })

    // Queue transcription in the background — never block the request,
    // transcription can take many minutes for long videos. Same pattern as today.
    const queued = await queueTranscription({
      meetingId,
      recordingId: recording.id,
      videoUrl: secureUrl,
      organizationId: session.user.organizationId,
    })
    if (!queued) {
      // Redis not available — defer with setTimeout so the HTTP response
      // flushes before any work begins.
      setTimeout(() => {
        void processTranscription(meetingId, secureUrl, session.user.organizationId).catch((e) =>
          console.error('[MEETING-UPLOAD] Transcription/MoM failed:', e)
        )
      }, 0)
    }

    return NextResponse.json({
      success: true,
      recording: {
        id: recording.id,
        secureUrl: recording.secureUrl,
        duration: recording.duration,
        fileSize: recording.fileSize,
      },
    })
  } catch (error) {
    console.error('Upload recording error:', error)
    return NextResponse.json({ error: 'Upload failed. Please try again.' }, { status: 500 })
  }
}
