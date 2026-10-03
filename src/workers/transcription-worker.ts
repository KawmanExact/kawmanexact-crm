import 'server-only'
import { createWorker, QUEUE_NAMES } from '@/lib/queue'
import type { TranscriptionJobData } from '@/workers/types'
import { processTranscription } from '@/services/meeting.service'

/**
 * Transcription Worker
 *
 * Processes transcription jobs from the TRANSCRIPTION queue. Each job
 * receives a meetingId, recordingId, and videoUrl (Cloudinary secure URL).
 *
 * The worker delegates to processTranscription() from meeting.service,
 * which:
 * 1. Transcribes the video (extracts audio first for AssemblyAI efficiency)
 * 2. Saves the transcript to the database
 * 3. Generates the MoM via AI
 * 4. Flips the meeting status from PROCESSING → COMPLETED (or FAILED on error)
 *
 * This runs as a BullMQ Worker in the same Node.js process (dev) or
 * a dedicated worker process (production), ensuring it never blocks
 * the server action's HTTP response.
 */
export function startTranscriptionWorker() {
  return createWorker<TranscriptionJobData>(
    QUEUE_NAMES.TRANSCRIPTION,
    async (job) => {
      const { meetingId, videoUrl, organizationId } = job.data
      await processTranscription(meetingId, videoUrl, organizationId)
    },
    { concurrency: 2 }
  )
}
