'use client'

import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { ChevronDown, Download } from 'lucide-react'

type ExportFormat = 'xlsx' | 'pdf' | 'csv'

const FORMATS: Array<{ format: ExportFormat; label: string; hint: string }> = [
  { format: 'xlsx', label: 'Excel (.xlsx)', hint: 'Detail, Product-wise and Salesperson × Product sheets' },
  { format: 'pdf', label: 'PDF', hint: 'Landscape A4, up to 5,000 rows' },
  { format: 'csv', label: 'CSV', hint: 'Plain text, formula-injection safe' },
]

/**
 * Export dropdown. Each item downloads the CURRENT URL query string, so the
 * file always contains exactly the rows the table shows — the server re-parses
 * those filters with the same parser the page used (lib/sales-filters.ts).
 */
export function SalesExportMenu() {
  const searchParams = useSearchParams()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  function start(format: ExportFormat) {
    setOpen(false)
    const query = searchParams.toString()
    const href = `/api/sales-tracking/export?format=${format}${query ? `&${query}` : ''}`
    // A hidden anchor keeps the download off the React router's navigation path,
    // which would otherwise try to render the binary response as a page.
    const anchor = document.createElement('a')
    anchor.href = href
    anchor.rel = 'noopener'
    anchor.download = ''
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/[0.08] px-3 text-sm text-white/70 transition-colors hover:bg-white/[0.05] hover:text-white"
      >
        <Download className="h-4 w-4" />
        Export
        <ChevronDown className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1.5 w-72 rounded-xl border border-white/[0.08] bg-[#0d1523] p-1.5 shadow-xl shadow-black/40"
        >
          {FORMATS.map((item) => (
            <button
              key={item.format}
              type="button"
              role="menuitem"
              onClick={() => start(item.format)}
              className="block w-full rounded-lg px-3 py-2 text-left transition-colors hover:bg-white/[0.05]"
            >
              <span className="block text-sm text-white">{item.label}</span>
              <span className="block text-xs text-white/40">{item.hint}</span>
            </button>
          ))}
          <p className="px-3 py-2 text-[11px] leading-relaxed text-white/30">
            Exports use the filters currently applied above, including the date range.
          </p>
        </div>
      )}
    </div>
  )
}