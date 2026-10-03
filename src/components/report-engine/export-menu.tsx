"use client"

import * as React from 'react'
import { Download, FileText, FileSpreadsheet, Printer, Loader2, Check, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { UniversalReportDefinition, ExportFormat } from '@/lib/report-engine/types'
import { cn } from '@/lib/utils'

type MenuState = 'idle' | 'generating' | 'success' | 'error'

interface ExportMenuProps {
  report: UniversalReportDefinition
  /** Optional override for API path (default: /api/reports/export). Useful in tests. */
  endpoint?: string
  className?: string
  buttonLabel?: string
  variant?: 'default' | 'outline' | 'ghost' | 'secondary'
  size?: 'default' | 'sm' | 'lg' | 'icon'
  disabled?: boolean
  onSuccess?: (format: ExportFormat, filename: string) => void
  onError?: (format: ExportFormat, message: string) => void
}

const FORMAT_META: Record<ExportFormat, { label: string; icon: React.ElementType; hint: string }> = {
  pdf: { label: 'Export as PDF', icon: FileText, hint: 'Print-ready A4' },
  csv: { label: 'Export as CSV', icon: FileText, hint: 'Excel / Sheets' },
  xlsx: { label: 'Export as Excel', icon: FileSpreadsheet, hint: '.xlsx workbook' },
  print: { label: 'Print', icon: Printer, hint: 'Open print dialog' },
}

function filenameFromDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback
  // attachment; filename="Kawman-ExAct-...csv"  or filename*=UTF-8''...
  const m = header.match(/filename\*?=(?:UTF-8''|")?([^";\n]+)"?/i)
  if (m) {
    try { return decodeURIComponent(m[1].replace(/^"/, '').replace(/"$/, '')) } catch { return m[1] }
  }
  return fallback
}

export function ExportMenu({
  report,
  endpoint = '/api/reports/export',
  className,
  buttonLabel = 'Export',
  variant = 'outline',
  size = 'sm',
  disabled,
  onSuccess,
  onError,
}: ExportMenuProps) {
  const [state, setState] = React.useState<MenuState>('idle')
  const [activeFormat, setActiveFormat] = React.useState<ExportFormat | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const generatingRef = React.useRef(false)

  const busy = state === 'generating'

  const triggerExport = React.useCallback(
    async (format: ExportFormat) => {
      if (generatingRef.current) return
      generatingRef.current = true
      setState('generating')
      setActiveFormat(format)
      setError(null)

      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ report, format }),
        })

        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error((data as { error?: string }).error ?? `Export failed (${res.status})`)
        }

        const disposition = res.headers.get('Content-Disposition')
        const fallbackName = `Kawman-ExAct-${report.name.replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}.${format === 'xlsx' ? 'xlsx' : format === 'pdf' ? 'pdf' : format === 'print' ? 'html' : 'csv'}`
        const filename = filenameFromDisposition(disposition, fallbackName)

        if (format === 'print') {
          const html = await res.text()
          const w = window.open('', '_blank')
          if (!w) throw new Error('Popup blocked — allow popups to print')
          w.document.open()
          w.document.write(html)
          w.document.close()
          // html itself calls window.print() on load; focus the new tab
          w.focus()
        } else {
          const blob = await res.blob()
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = filename
          document.body.appendChild(a)
          a.click()
          a.remove()
          setTimeout(() => URL.revokeObjectURL(url), 4000)
        }

        setState('success')
        onSuccess?.(format, filename)
        setTimeout(() => {
          setState('idle')
          setActiveFormat(null)
        }, 1800)
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Export failed'
        setError(msg)
        setState('error')
        onError?.(format, msg)
        setTimeout(() => {
          setState('idle')
          setActiveFormat(null)
          setError(null)
        }, 2600)
      } finally {
        generatingRef.current = false
      }
    },
    [report, endpoint, onSuccess, onError],
  )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={variant}
          size={size}
          className={cn('gap-1.5', className)}
          disabled={disabled || busy}
          aria-busy={busy}
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : state === 'success' ? (
            <Check className="h-3.5 w-3.5 text-emerald-400" />
          ) : state === 'error' ? (
            <AlertCircle className="h-3.5 w-3.5 text-red-400" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
          {state === 'generating' && activeFormat
            ? `Generating ${activeFormat.toUpperCase()}…`
            : state === 'success'
              ? 'Downloaded'
              : state === 'error'
                ? 'Failed — try again'
                : buttonLabel}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs font-semibold tracking-wide text-white/60">
          Export report
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {(Object.keys(FORMAT_META) as ExportFormat[]).map((fmt) => {
          const meta = FORMAT_META[fmt]
          const Icon = meta.icon
          const isActive = busy && activeFormat === fmt
          return (
            <DropdownMenuItem
              key={fmt}
              disabled={busy}
              onClick={() => triggerExport(fmt)}
              className={cn('gap-2 cursor-pointer', isActive && 'opacity-60')}
            >
              {isActive ? (
                <Loader2 className="h-4 w-4 animate-spin text-purple-400" />
              ) : (
                <Icon className="h-4 w-4 text-white/70" />
              )}
              <span className="flex-1">{meta.label}</span>
              <span className="text-xs text-white/40">{meta.hint}</span>
            </DropdownMenuItem>
          )
        })}
        {error && (
          <>
            <DropdownMenuSeparator />
            <div className="px-2 py-1.5 text-xs text-red-400 flex gap-1.5 items-start">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span className="break-words">{error}</span>
            </div>
          </>
        )}
        <DropdownMenuSeparator />
        <p className="px-2 py-1 text-[11px] leading-relaxed text-white/30">
          Files are named <span className="text-white/50 font-mono">Kawman-ExAct-{'{name}'}-{'{date}'}.{'{ext}'}</span>
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * Lightweight inline button variant — one format, no dropdown.
 * Useful when a page only offers a single export (e.g. "Download CSV").
 */
export function ExportButton({
  report,
  format,
  endpoint = '/api/reports/export',
  children,
  className,
  variant = 'outline',
  size = 'sm',
  disabled,
}: {
  report: UniversalReportDefinition
  format: ExportFormat
  endpoint?: string
  children?: React.ReactNode
  className?: string
  variant?: 'default' | 'outline' | 'ghost' | 'secondary'
  size?: 'default' | 'sm' | 'lg' | 'icon'
  disabled?: boolean
}) {
  const [state, setState] = React.useState<MenuState>('idle')
  const busy = state === 'generating'
  const meta = FORMAT_META[format]
  const Icon = meta.icon

  const handleClick = async () => {
    if (busy) return
    setState('generating')
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report, format }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error ?? `Export failed (${res.status})`)
      }
      const disposition = res.headers.get('Content-Disposition')
      const fallback = `Kawman-ExAct-${report.name.replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}.${format === 'xlsx' ? 'xlsx' : format === 'pdf' ? 'pdf' : format === 'print' ? 'html' : 'csv'}`
      const filename = filenameFromDisposition(disposition, fallback)
      if (format === 'print') {
        const html = await res.text()
        const w = window.open('', '_blank')
        if (!w) throw new Error('Popup blocked — allow popups to print')
        w.document.open()
        w.document.write(html)
        w.document.close()
        w.focus()
      } else {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        document.body.appendChild(a)
        a.click()
        a.remove()
        setTimeout(() => URL.revokeObjectURL(url), 4000)
      }
      setState('success')
      setTimeout(() => setState('idle'), 1600)
    } catch {
      setState('error')
      setTimeout(() => setState('idle'), 2200)
    }
  }

  return (
    <Button variant={variant} size={size} className={cn('gap-1.5', className)} onClick={handleClick} disabled={disabled || busy} aria-busy={busy}>
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : state === 'success' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : state === 'error' ? <AlertCircle className="h-3.5 w-3.5 text-red-400" /> : <Icon className="h-3.5 w-3.5" />}
      {children ?? meta.label}
    </Button>
  )
}
