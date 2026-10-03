'use client'

import * as React from 'react'
import { Sparkles, AlertTriangle, Send, Trash2, Copy, Check, FileDown, Loader2 } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Markdown } from './markdown'
import { AiUpload, type UploadedFileInfo } from './ai-upload'
import { AiCharts } from './ai-charts'
import { buildAiReport } from '@/lib/report-engine/builders/ai-report'

const DATA_ANALYSIS_PROMPTS = [
  'Which deals are most at risk of slipping this month?',
  'What lead source is converting best right now?',
  'Where is the pipeline getting stuck?',
  'Summarize this week vs last week in one paragraph.',
] as const

interface QA {
  question: string
  answer: string
  charts?: UploadedFileInfo['charts']
}

export function DataAnalysisPanel({ aiConfigured }: { aiConfigured: boolean }) {
  const [question, setQuestion] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [history, setHistory] = React.useState<QA[]>([])
  const [copiedIdx, setCopiedIdx] = React.useState<number | null>(null)
  const [clearConfirm, setClearConfirm] = React.useState(false)
  const [exportingIdx, setExportingIdx] = React.useState<number | null>(null)

  // Upload state
  const [uploaded, setUploaded] = React.useState<UploadedFileInfo[]>([])
  const [uploading, setUploading] = React.useState(false)
  const [uploadError, setUploadError] = React.useState<string | null>(null)

  async function handleFilesSelected(list: FileList) {
    setUploadError(null)
    if (uploaded.length + list.length > 3) {
      setUploadError('You can attach up to 3 files.')
      return
    }
    const form = new FormData()
    for (let i = 0; i < list.length; i++) form.append('files', list[i])
    setUploading(true)
    try {
      const res = await fetch('/api/ai/upload', { method: 'POST', body: form })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as { error?: string }).error || 'Upload failed')
      const incoming = (data as { files: UploadedFileInfo[] }).files ?? []
      setUploaded((prev) => [...prev, ...incoming].slice(0, 3))
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  async function runAnalysis(q: string) {
    const eff = q.trim() || (uploaded.length ? 'Analyse the attached files. If it is a spreadsheet, summarise the data, call out key numbers, and describe what the charts show.' : '')
    if (!eff || loading) return
    setLoading(true)
    setError(null)
    const turnFiles = [...uploaded]
    const turnCharts = turnFiles.flatMap((f) => f.charts ?? [])
    const docContext = turnFiles.map((f) => f.snippet).join('\n\n').slice(0, 18_000) || undefined
    const images = turnFiles
      .filter((f) => f.kind === 'image' && f.imageBase64)
      .map((f) => ({ base64: f.imageBase64!, mimeType: f.mimeType }))
    // keep uploader sticky for data-analysis (user may run several questions on same file)
    try {
      const res = await fetch('/api/ai/data-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: eff,
          docContext,
          images: images.length ? images : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to analyze')
      setHistory((prev) => [{ question: eff, answer: data.answer as string, charts: turnCharts.length ? turnCharts : undefined }, ...prev])
      setQuestion('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  function handleCopy(i: number, text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIdx(i)
      setTimeout(() => setCopiedIdx(null), 1600)
    }).catch(() => {})
  }

  async function handleExportPdf(qa: QA, idx: number) {
    setExportingIdx(idx)
    setError(null)
    try {
      const def = buildAiReport({
        title: qa.question.slice(0, 80) || 'Data Analysis',
        type: 'DATA_ANALYSIS',
        content: `## Question\n${qa.question}\n\n## Answer\n${qa.answer}`,
        createdAt: new Date().toISOString(),
        generatedByName: 'Data Analysis',
      })
      const res = await fetch('/api/reports/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report: def, format: 'pdf' }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error || 'Export failed')
      }
      const blob = await res.blob()
      const disposition = res.headers.get('Content-Disposition')
      const m = disposition?.match(/filename="?([^";]+)"?/)
      const filename = m ? m[1] : `Kawman-ExAct-Data-Analysis-${new Date().toISOString().slice(0, 10)}.pdf`
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
      setExportingIdx(null)
    }
  }

  return (
    <div className="space-y-6">
      {!aiConfigured && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Data Analysis isn&apos;t configured yet. Set <code className="text-amber-100">OPENAI_API_KEY</code> or{' '}
          <code className="text-amber-100">GOOGLE_GENERATIVE_AI_API_KEY</code> to enable it.
        </div>
      )}

      <Card className="bg-[#0a111c]/80 border-white/[0.08] p-4 space-y-3">
        <AiUpload
          files={uploaded}
          uploading={uploading}
          disabled={!aiConfigured || loading}
          onFilesSelected={handleFilesSelected}
          onRemove={(idx) => setUploaded((prev) => prev.filter((_, i) => i !== idx))}
        />
        {uploadError && <p className="text-xs text-amber-300">{uploadError}</p>}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            runAnalysis(question)
          }}
          className="flex gap-2"
        >
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={uploaded.length ? 'Ask about the uploaded file — e.g. “summarise this sheet and flag anomalies”' : 'Ask a question about your leads, deals, or pipeline...'}
            disabled={!aiConfigured || loading}
            className="flex-1 h-10 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500/50 disabled:opacity-50"
          />
          <Button type="submit" size="sm" disabled={!aiConfigured || loading || (!question.trim() && !uploaded.length)} className="gap-1.5">
            <Send className="h-3.5 w-3.5" />
            {loading ? 'Analyzing…' : 'Analyze'}
          </Button>
        </form>

        <div className="flex flex-wrap gap-2">
          {DATA_ANALYSIS_PROMPTS.map((p) => (
            <button
              key={p}
              type="button"
              disabled={!aiConfigured || loading}
              onClick={() => runAnalysis(p)}
              className="text-xs px-2.5 py-1 rounded-full border border-white/[0.08] text-white/60 hover:text-white hover:bg-white/[0.06] transition-colors disabled:opacity-40"
            >
              {p}
            </button>
          ))}
        </div>
      </Card>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {history.length > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-white/35">{history.length} {history.length === 1 ? 'result' : 'results'}</p>
          <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-white/40 hover:text-red-300 hover:bg-red-500/10 text-xs" onClick={() => setClearConfirm(true)}>
            <Trash2 className="h-3.5 w-3.5" /> Clear all
          </Button>
        </div>
      )}

      {history.length === 0 && !loading ? (
        <div className="rounded-xl border border-white/10 bg-white/5 py-12 text-center">
          <Sparkles className="h-6 w-6 text-white/30 mx-auto mb-2" />
          <p className="text-white/40 text-sm">Ask a question above — or drop a PDF / image / Excel sheet to analyze it.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {loading && (
            <Card className="bg-[#0a111c]/80 border-white/[0.08] p-4 animate-pulse">
              <p className="text-sm text-white/40">Analyzing…</p>
            </Card>
          )}
          {history.map((qa, i) => (
            <Card key={i} className="bg-[#0a111c]/80 border-white/[0.08] p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium text-white/80 flex-1">{qa.question}</p>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0 text-white/25 hover:text-red-300 hover:bg-red-500/10"
                  title="Remove"
                  onClick={() => setHistory((prev) => prev.filter((_, idx) => idx !== i))}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              {qa.charts?.length ? <AiCharts charts={qa.charts} /> : null}
              <div className="border-t border-white/[0.06] pt-3">
                <Markdown content={qa.answer} />
              </div>
              <div className="flex items-center gap-1.5 pt-1 border-t border-white/[0.04]">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 text-white/40 hover:text-white text-xs"
                  onClick={() => handleCopy(i, qa.answer)}
                >
                  {copiedIdx === i ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                  {copiedIdx === i ? 'Copied' : 'Copy'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 text-white/40 hover:text-white text-xs"
                  disabled={exportingIdx === i}
                  onClick={() => handleExportPdf(qa, i)}
                >
                  {exportingIdx === i ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileDown className="h-3 w-3" />}
                  Export PDF
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 text-red-300/50 hover:text-red-300 hover:bg-red-500/10 text-xs ml-auto"
                  onClick={() => setHistory((prev) => prev.filter((_, idx) => idx !== i))}
                >
                  <Trash2 className="h-3 w-3" /> Delete
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={clearConfirm}
        onOpenChange={setClearConfirm}
        title="Clear all results?"
        description="All analysis results on this page will be removed. This cannot be undone."
        confirmLabel="Clear all"
        variant="destructive"
        onConfirm={() => { setHistory([]); setClearConfirm(false) }}
      />
    </div>
  )
}
