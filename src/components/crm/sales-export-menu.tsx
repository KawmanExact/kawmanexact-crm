'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'next/navigation'
import { ChevronDown, Download } from 'lucide-react'

type ExportFormat = 'xlsx' | 'pdf' | 'csv'

const FORMATS: Array<{ format: ExportFormat; label: string; hint: string }> = [
  { format: 'xlsx', label: 'Excel (.xlsx)', hint: 'Detail, Product-wise and Salesperson × Product sheets' },
  { format: 'pdf', label: 'PDF', hint: 'Landscape A4, up to 5,000 rows' },
  { format: 'csv', label: 'CSV', hint: 'Plain text, formula-injection safe' },
]

/**
 * Export dropdown. Each item downloads the CURRENT URL filters (minus
 * pagination / print params), so the file contains the full filtered set that
 * the table is showing. The server re-parses them with the same parser the
 * page uses (lib/sales-filters.ts).
 *
 * - The panel renders in a portal with fixed positioning, so it always sits
 *   above the table card and is never clipped by an overflow-hidden ancestor.
 * - The download uses fetch -> blob, so server errors show up under the button
 *   instead of being saved as a broken "export.json" file.
 */
export function SalesExportMenu() {
  const searchParams = useSearchParams()
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, right: 0 })
  const [exporting, setExporting] = useState<ExportFormat | null>(null)
  const [error, setError] = useState<string | null>(null)

  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const close = useCallback((returnFocus = false) => {
    setOpen(false)
    if (returnFocus) buttonRef.current?.focus()
  }, [])

  function toggle() {
    setError(null)
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setPos({
        top: rect.bottom + 6,
        right: Math.max(8, window.innerWidth - rect.right),
      })
    }
    setOpen((prev) => !prev)
  }

  useEffect(() => {
    if (!open) return

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node
      if (panelRef.current?.contains(target)) return
      if (buttonRef.current?.contains(target)) return
      close()
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        close(true)
        return
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        const items = Array.from(
          panelRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []
        )
        if (items.length === 0) return
        event.preventDefault()
        const current = items.indexOf(document.activeElement as HTMLButtonElement)
        const next =
          event.key === 'ArrowDown'
            ? (current + 1) % items.length
            : (current - 1 + items.length) % items.length
        items[next].focus()
      }
    }

    // Fixed coordinates don't follow the button, so close if the layout moves.
    function onViewportChange() {
      close()
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', onViewportChange)
    window.addEventListener('scroll', onViewportChange, true)

    // Move focus into the menu for keyboard users.
    panelRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()

    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', onViewportChange)
      window.removeEventListener('scroll', onViewportChange, true)
    }
  }, [open, close])

  async function start(format: ExportFormat) {
    close()
    setError(null)
    setExporting(format)

    // Export the whole filtered set: drop pagination and print-view params.
    const params = new URLSearchParams(searchParams.toString())
    params.delete('page')
    params.delete('pageSize')
    params.delete('print')
    params.set('format', format)

    try {
      const res = await fetch(`/api/sales-tracking/export?${params.toString()}`)

      if (!res.ok) {
        let message = `Export failed (${res.status})`
        try {
          const text = await res.text()
          try {
            const json = JSON.parse(text) as { error?: string }
            if (json.error) message = json.error
          } catch {
            if (text) message = text.slice(0, 200)
          }
        } catch {
          // keep the status-based message
        }
        throw new Error(message)
      }

      // Use the server's filename if it sent one.
      const disposition = res.headers.get('Content-Disposition') ?? ''
      const match = /filename="?([^";]+)"?/i.exec(disposition)
      const filename = match?.[1] ?? `sales-export.${format}`

      const blob = await res.blob()
      const objectUrl = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = objectUrl
      anchor.download = filename
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      // Give the browser a moment to start the download before revoking.
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setExporting(null)
    }
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        disabled={exporting !== null}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/[0.08] px-3 text-sm text-white/70 transition-colors hover:bg-white/[0.05] hover:text-white disabled:opacity-60"
      >
        <Download className="h-4 w-4" />
        {exporting ? 'Exporting…' : 'Export'}
        <ChevronDown className="h-3.5 w-3.5" />
      </button>

      {error && (
        <p
          role="alert"
          className="absolute right-0 top-full z-[100] mt-1.5 w-72 max-w-[calc(100vw-1rem)] rounded-lg border border-red-500/30 bg-[#0d1523] p-2 text-xs text-red-300 shadow-xl shadow-black/40"
        >
          {error}
        </p>
      )}

      {open &&
        createPortal(
          <div
            ref={panelRef}
            role="menu"
            aria-label="Export format"
            style={{ position: 'fixed', top: pos.top, right: pos.right }}
            className="z-[100] w-72 max-w-[calc(100vw-1rem)] rounded-xl border border-white/[0.08] bg-[#0d1523] p-1.5 shadow-xl shadow-black/40"
          >
            {FORMATS.map((item) => (
              <button
                key={item.format}
                type="button"
                role="menuitem"
                onClick={() => start(item.format)}
                className="block w-full rounded-lg px-3 py-2 text-left transition-colors hover:bg-white/[0.05] focus:bg-white/[0.05] focus:outline-none"
              >
                <span className="block text-sm text-white">{item.label}</span>
                <span className="block text-xs text-white/40">{item.hint}</span>
              </button>
            ))}
            <p className="px-3 py-2 text-[11px] leading-relaxed text-white/30">
              Exports use the filters currently applied above, including the date range.
            </p>
          </div>,
          document.body
        )}
    </div>
  )
}