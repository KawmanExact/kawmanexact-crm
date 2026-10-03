'use client'

import { useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Copy, Printer, Check, Trash2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { ExportMenu } from '@/components/report-engine/export-menu'
import { buildAiReport } from '@/lib/report-engine/builders/ai-report'

type ReportForActions = {
  id: string
  title: string
  type: string
  content: string
  createdAt: string
  generatedByName: string
}

export function ReportActions({ report }: { report?: ReportForActions }) {
  const router = useRouter()
  const [copied, setCopied] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleting, startDelete] = useTransition()

  const exportReport = useMemo(() => {
    if (!report) return null
    return buildAiReport({
      title: report.title,
      type: report.type,
      content: report.content,
      createdAt: report.createdAt,
      generatedByName: report.generatedByName,
    })
  }, [report])

  function handleDelete() {
    if (!report) return
    startDelete(async () => {
      const res = await fetch(`/api/ai/reports/${report.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        alert((data as { error?: string }).error || 'Failed to delete report')
        return
      }
      router.push('/ai/reports')
      router.refresh()
    })
  }

  return (
    <>
      <div className="flex items-center gap-1.5 flex-wrap">
        {exportReport && <ExportMenu report={exportReport} />}
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 text-white/60 hover:text-white hover:bg-white/10"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(window.location.href)
              setCopied(true)
              setTimeout(() => setCopied(false), 1800)
            } catch {}
          }}
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copied' : 'Copy link'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 text-white/60 hover:text-white hover:bg-white/10"
          onClick={() => window.print()}
        >
          <Printer className="h-3.5 w-3.5" />
          Print
        </Button>
        {report && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-red-300/70 hover:text-red-300 hover:bg-red-500/10"
            disabled={deleting}
            onClick={() => setConfirmOpen(true)}
          >
            {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            Delete
          </Button>
        )}
      </div>

      {report && (
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title="Delete report?"
          description={`“${report.title}” will be permanently deleted. This cannot be undone.`}
          confirmLabel="Delete"
          variant="destructive"
          loading={deleting}
          onConfirm={handleDelete}
        />
      )}
    </>
  )
}
