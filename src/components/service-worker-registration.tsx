'use client'

import { useEffect } from 'react'

/** Registers the app-shell service worker (see public/sw.js). No-ops silently if the browser doesn't support it or registration fails — this is a progressive enhancement, not a requirement for the app to work. */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Best-effort; the app works fine without it.
    })
  }, [])

  return null
}
