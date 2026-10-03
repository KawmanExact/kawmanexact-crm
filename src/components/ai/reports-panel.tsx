'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FileBarChart, Sparkles, AlertTriangle, ArrowRight, Loader2, Trash2, FileDown } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { formatDistanceToNow } from 'date-fns'
import { buildAiReport } from '@/lib/report-engine/builders/ai-report'

interface ReportTypeMeta {
  type: string
  title: string
  description: string
}

interface ReportSummary {
  id: string
  type: string
  title: string
  createdAt: string
  generatedByName: string
}

export function ReportsPanel({
  reportTypes,
  initialReports,
  aiConfigured,
}: {
  reportTypes: ReportTypeMeta[]
  initialReports: ReportSummary[]
  aiConfigured: boolean
}) {
  const router = useRouter()
  const [reports, setReports] = React.useState(initialReports)
  const [generating, setGenerating] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<ReportSummary | null>(null)
  const [deleting, startDeleting] = React.useTransition()
  const [exportingId, setExportingId] = React.useState<string | null>(null)

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReports(() => initialReports)
  }, [initialReports])

  async function handleGenerate(type: string) {
    setGenerating(type)
    setError(null)
    try {
      const res = await fetch('/api/ai/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to generate report')
      router.push(`/ai/reports/${data.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setGenerating(null)
    }
  }

  function handleDelete() {
    if (!deleteTarget) return
    const id = deleteTarget.id
    startDeleting(async () => {
      const res = await fetch(`/api/ai/reports/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError((data as { error?: string }).error || 'Failed to delete report')
        return
      }
      setReports((prev) => prev.filter((r) => r.id !== id))
      setDeleteTarget(null)
      router.refresh()
    })
  }

  async function handleExport(report: ReportSummary) {
    setExportingId(report.id)
    try {
      const res = await fetch(`/api/ai/reports/${report.id}`)
      if (!res.ok) throw new Error('Failed to load report')
      const full = (await res.json()) as { title: string; type: string; content: string; createdAt: string; generatedByName: string }
      const def = buildAiReport({
        title: full.title,
        type: full.type,
        content: full.content,
        createdAt: full.createdAt,
        generatedByName: full.generatedByName,
      })
      // Universal export — server renders premium PDF/Excel/CSV via shared template → Puppeteer/ExcelJS
      const exportRes = await fetch('/api/reports/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report: def, format: 'pdf' }),
      })
      if (!exportRes.ok) {
        const data = await exportRes.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error || 'Export failed')
      }
      const blob = await exportRes.blob()
      const disposition = exportRes.headers.get('Content-Disposition')
      const m = disposition?.match(/filename="?([^";]+)"?/)
      const filename = m ? m[1] : `Kawman-ExAct-${def.name}.pdf`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 4000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed')
    } finally {
      setExportingId(null)
    }
  }

  return (
    <div className="space-y-8">
      {!aiConfigured && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          AI Reports isn&apos;t configured yet. Set <code className="text-amber-100">OPENAI_API_KEY</code> or{' '}
          <code className="text-amber-100">GOOGLE_GENERATIVE_AI_API_KEY</code> to enable generation.
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div>
        <h2 className="text-sm font-semibold text-white/70 mb-3">Generate a new report</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {reportTypes.map((rt) => (
            <Card key={rt.type} className="flex flex-col">
              <CardHeader>
                <div className="h-9 w-9 rounded-lg bg-purple-500/15 border border-purple-500/30 flex items-center justify-center mb-2">
                  <Sparkles className="h-4 w-4 text-purple-300" />
                </div>
                <CardTitle className="text-base">{rt.title}</CardTitle>
                <CardDescription>{rt.description}</CardDescription>
              </CardHeader>
              <CardFooter className="mt-auto">
                <Button
                  size="sm"
                  className="w-full gap-1.5"
                  disabled={!aiConfigured || generating !== null}
                  onClick={() => handleGenerate(rt.type)}
                >
                  {generating === rt.type ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3.5 w-3.5" />
                      Generate
                    </>
                  )}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-3">
          <FileBarChart className="h-4 w-4 text-white/40" />
          <h2 className="text-sm font-semibold text-white/70">Recent reports</h2>
          <span className="text-xs text-white/30">({reports.length})</span>
        </div>
        {reports.length === 0 ? (
          <Card className="p-8 text-center border-dashed">
            <p className="text-sm text-white/40">No reports yet. Generate one above.</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {reports.map((r) => (
              <Card key={r.id} className="flex flex-col">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm leading-tight line-clamp-2">{r.title}</CardTitle>
                  <CardDescription className="text-xs">
                    {r.type.replace(/_/g, ' ')} · {formatDistanceToNow(new Date(r.createdAt), { addSuffix: true })} · {r.generatedByName}
                  </CardDescription>
                </CardHeader>
                <CardFooter className="mt-auto flex items-center gap-1.5 pt-3">
                  <Button asChild variant="ghost" size="sm" className="gap-1.5 h-7">
                    <Link href={`/ai/reports/${r.id}`}>
                      View <ArrowRight className="h-3 w-3" />
                    </Link>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-white/40 hover:text-white"
                    title="Export PDF (universal)"
                    disabled={exportingId === r.id}
                    onClick={() => handleExport(r)}
                  >
                    {exportingId === r.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <FileDown className="h-3.5 w-3.5" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-white/30 hover:text-red-300 hover:bg-red-500/10"
                    title="Delete report"
                    onClick={() => setDeleteTarget(r)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Delete report?"
        description={deleteTarget ? `"${deleteTarget.title}" will be permanently deleted.` : ''}
        confirmLabel="Delete"
        variant="destructive"
        loading={deleting}
        onConfirm={handleDelete}
      />
    </div>
  )
}