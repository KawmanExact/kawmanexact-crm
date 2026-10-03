import 'server-only'

/**
 * Auto-starts BullMQ workers when `AUTO_START_WORKERS=true` and Redis
 * is available. Workers are started exactly once per process using a
 * global singleton guard, so importing this module is idempotent.
 *
 * In development (next dev) the workers run in the same process.
 * In production, run workers as a dedicated process or rely on this
 * auto-start in each server instance.
 */

const globalForWorkers = globalThis as unknown as {
  __workersStarted?: boolean
}

export function startWorkers() {
  if (globalForWorkers.__workersStarted) return
  if (process.env.AUTO_START_WORKERS === 'false') return
  if (!process.env.REDIS_URL) return

  globalForWorkers.__workersStarted = true

  void import('@/workers/transcription-worker')
    .then(({ startTranscriptionWorker }) => {
      startTranscriptionWorker()
      console.log('[WORKERS] Transcription worker started')
    })
    .catch((err) => {
      console.error('[WORKERS] Failed to start transcription worker:', err)
    })
}

startWorkers()
