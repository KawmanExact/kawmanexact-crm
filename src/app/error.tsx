'use client'

import { useEffect } from 'react'
import { AlertTriangle, RotateCcw, Home } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

/**
 * Root error boundary (audit: "No error boundaries — Uncaught errors
 * crash entire page"). Next.js renders this automatically whenever a
 * Server or Client Component in this route segment throws during
 * render — the rest of the app (sidebar, header) still comes from the
 * parent layout, so this only replaces the broken content area, not the
 * whole page chrome.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Server-side equivalent of an unhandled exception log — Next.js
    // doesn't forward render errors anywhere by default.
    console.error('[error-boundary]', error)
  }, [error])

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-4">
        <div className="h-14 w-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto">
          <AlertTriangle className="h-6 w-6 text-red-400" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-white">Something went wrong</h2>
          <p className="text-sm text-white/50 mt-1">
            This page hit an unexpected error. You can try again, or head back to the dashboard.
          </p>
          {error.digest && <p className="text-xs text-white/30 mt-2 font-mono">Error ID: {error.digest}</p>}
        </div>
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button onClick={reset} className="gap-1.5">
            <RotateCcw className="h-3.5 w-3.5" />
            Try again
          </Button>
          <Button asChild variant="ghost">
            <Link href="/dashboard" className="gap-1.5 inline-flex items-center">
              <Home className="h-3.5 w-3.5" />
              Go to dashboard
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
