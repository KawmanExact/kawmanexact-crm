'use client'

import * as React from 'react'

export type TrackingStatus = 'idle' | 'requesting' | 'tracking' | 'paused' | 'denied' | 'unavailable' | 'error'
export type TrackingError = { code: number; message: string } | null

const SEND_INTERVAL_MS = 12_000 // target 10–15s cadence per spec
const WATCH_OPTS: PositionOptions = { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 }

function errMessage(code: number, msg: string): string {
  if (code === 1) return 'Location permission denied. Enable location in your browser/device settings and try again.'
  if (code === 2) return 'GPS unavailable. Move to an open area and ensure location services are on.'
  if (code === 3) return 'Location timed out. Retrying…'
  return msg || 'Could not get your location.'
}

/**
 * Continuous field tracking via navigator.geolocation.watchPosition().
 * - Starts/pauses on demand (field session).
 * - Throttles POST /api/field-sales/live-location to ~every 12s.
 * - Persists `fieldTrackingEnabled` so tracking resumes on reload if user left it on.
 * - Calls DELETE to mark isTracking=false when stopped/logged out.
 */
export function useFieldTracking() {
  const [status, setStatus] = React.useState<TrackingStatus>('idle')
  const [error, setError] = React.useState<TrackingError>(null)
  const [lastPos, setLastPos] = React.useState<GeolocationPosition | null>(null)
  const [lastSentAt, setLastSentAt] = React.useState<Date | null>(null)
  const watchIdRef = React.useRef<number | null>(null)
  const lastSentRef = React.useRef<number>(0)
  const pendingPosRef = React.useRef<GeolocationPosition | null>(null)
  const intervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null)
  const enabledRef = React.useRef(false)

  const sendPosition = React.useCallback(async (pos: GeolocationPosition) => {
    const now = Date.now()
    // Client throttle: don't spam faster than SEND_INTERVAL
    if (now - lastSentRef.current < 8_000) {
      pendingPosRef.current = pos
      return
    }
    lastSentRef.current = now
    pendingPosRef.current = null
    try {
      await fetch('/api/field-sales/live-location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          heading: pos.coords.heading,
          speed: pos.coords.speed,
        }),
      })
      setLastSentAt(new Date())
    } catch {}
  }, [])

  // Interval to flush pending position if we throttled
  React.useEffect(() => {
    intervalRef.current = setInterval(() => {
      if (!enabledRef.current || !pendingPosRef.current) return
      const now = Date.now()
      if (now - lastSentRef.current >= SEND_INTERVAL_MS) {
        const p = pendingPosRef.current
        pendingPosRef.current = null
        if (p) sendPosition(p)
      }
    }, 3_000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [sendPosition])

  const stop = React.useCallback(async () => {
    enabledRef.current = false
    if (watchIdRef.current != null) {
      try { navigator.geolocation.clearWatch(watchIdRef.current) } catch {}
      watchIdRef.current = null
    }
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
    setStatus('idle')
    try { localStorage.setItem('fieldTrackingEnabled', '0') } catch {}
    // Mark isTracking false server-side
    try { await fetch('/api/field-sales/live-location', { method: 'DELETE' }) } catch {}
  }, [])

  const start = React.useCallback(() => {
    if (!('geolocation' in navigator)) {
      setStatus('unavailable')
      setError({ code: 0, message: 'Geolocation not supported on this device/browser.' })
      return
    }
    setError(null)
    setStatus('requesting')
    enabledRef.current = true
    try { localStorage.setItem('fieldTrackingEnabled', '1') } catch {}

    // Clear any prior watch
    if (watchIdRef.current != null) {
      try { navigator.geolocation.clearWatch(watchIdRef.current) } catch {}
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setLastPos(pos)
        setStatus('tracking')
        setError(null)
        // First fix sent immediately, subsequent throttled
        if (lastSentRef.current === 0) {
          sendPosition(pos)
        } else {
          pendingPosRef.current = pos
          // If enough time elapsed, flush now
          if (Date.now() - lastSentRef.current >= SEND_INTERVAL_MS) {
            const p = pendingPosRef.current
            pendingPosRef.current = null
            if (p) sendPosition(p)
          }
        }
      },
      (err) => {
        const code = err.code
        const msg = errMessage(code, err.message)
        setError({ code, message: msg })
        if (code === 1) setStatus('denied')
        else if (code === 2) setStatus('unavailable')
        else setStatus('error')
      },
      WATCH_OPTS
    )

    // Restart interval for flushing
    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = setInterval(() => {
      if (!enabledRef.current || !pendingPosRef.current) return
      if (Date.now() - lastSentRef.current >= SEND_INTERVAL_MS) {
        const p = pendingPosRef.current
        pendingPosRef.current = null
        if (p) sendPosition(p)
      }
    }, 3_000)
  }, [sendPosition])

  // Pause when tab hidden (save battery), resume on visible if tracking was on
  React.useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible' && enabledRef.current && status === 'paused') {
        // Resume: watchPosition survives hidden but some browsers pause; re-start if needed
        if (watchIdRef.current == null) start()
        else setStatus('tracking')
      } else if (document.visibilityState === 'hidden' && enabledRef.current && status === 'tracking') {
        setStatus('paused')
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [status, start])

  // Auto-resume if user previously enabled tracking
  React.useEffect(() => {
    try {
      if (localStorage.getItem('fieldTrackingEnabled') === '1') {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        start()
      }
    } catch {}
    // Stop on page unload / logout: ensure isTracking cleared
    const onBeforeUnload = () => {
      if (enabledRef.current) {
        try { navigator.sendBeacon('/api/field-sales/live-location', JSON.stringify({ _beacon: true })) } catch {}
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      // Cleanup watch on unmount but keep isTracking (so other tabs still see active until stale)
      if (watchIdRef.current != null) {
        try { navigator.geolocation.clearWatch(watchIdRef.current) } catch {}
      }
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Also stop tracking when auth session ends (sign-out). Poll /api/auth/get-session cheaply? Instead expose stop for header to call.
  return { status, error, lastPos, lastSentAt, start, stop, isTracking: status === 'tracking' || status === 'paused' }
}
