'use client'

import { useEffect } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

/**
 * Catches errors thrown by the root layout itself (very rare — layout.tsx
 * has almost no logic — but without this file, a layout-level error would
 * show Next.js's unstyled default error screen instead of something on
 * brand). Must render its own <html>/<body> since it replaces the layout
 * that would normally provide them.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[global-error]', error)
  }, [error])

  return (
    <html lang="en">
      <body className="bg-[#050A12] text-white font-sans antialiased">
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="max-w-md w-full text-center space-y-4">
            <div className="h-14 w-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto">
              <AlertTriangle className="h-6 w-6 text-red-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Something went wrong</h2>
              <p className="text-sm text-white/50 mt-1">The app hit an unexpected error. Please try again.</p>
              {error.digest && <p className="text-xs text-white/30 mt-2 font-mono">Error ID: {error.digest}</p>}
            </div>
            <button
              onClick={reset}
              className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
