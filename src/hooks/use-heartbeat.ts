'use client'
import { useEffect, useRef } from 'react'
import { useSession } from '@/lib/auth-client'

export function useHeartbeat(enabled = true, intervalMs = 60000) {
  const { data: session } = useSession()
  const userId = session?.user?.id
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!enabled || !userId) return
    const beat = () => {
      fetch('/api/presence/heartbeat', { method: 'POST' }).catch(() => {})
    }
    beat()
    timer.current = setInterval(beat, intervalMs)
    const onVis = () => { if (document.visibilityState === 'visible') beat() }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      if (timer.current) clearInterval(timer.current)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [enabled, userId, intervalMs])
}
