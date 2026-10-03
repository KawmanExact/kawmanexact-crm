'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Sparkles, AlertTriangle, ArrowRight, Loader2 } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatDistanceToNow } from 'date-fns'

interface ReportSummary {
  id: string
  type: string
  title: string
  createdAt: string
  generatedByName: string
}

export function TeamSummaryPanel({
  aiConfigured,
  initialReports,
  from,
  to,
}: {
  aiConfigured: boolean
  initialReports: ReportSummary[]
  from?: string
  to?: string
}) {
  const router = useRouter()
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleGenerateTeam() {
    setGenerating(true)
    setError(null)
    try {
      const res = await fetch('/api/ai/employee-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to generate summary')
      router.push(`/ai/reports/${data.id}`)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="space-y-4">
      {!aiConfigured && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Team summaries need <code className="text-amber-100">OPENAI_API_KEY</code> or <code className="text-amber-100">GOOGLE_GENERATIVE_AI_API_KEY</code>.
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <Card className="flex flex-col bg-[#0a111c]/80 border-white/[0.08]">
        <CardHeader>
          <div className="h-9 w-9 rounded-lg bg-purple-500/15 border border-purple-500/30 flex items-center justify-center mb-2">
            <Sparkles className="h-4 w-4 text-purple-300" />
          </div>
          <CardTitle className="text-base">Team Management Summary</CardTitle>
          <CardDescription>AI summary for the selected date range — productivity, submission rate, blockers, and recommendations.</CardDescription>
        </CardHeader>
        <CardFooter>
          <Button size="sm" className="w-full gap-1.5" disabled={!aiConfigured || generating} onClick={handleGenerateTeam}>
            {generating ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating…</> : <>Generate team summary</>}
          </Button>
        </CardFooter>
      </Card>

      <div>
        <h3 className="text-sm font-semibold text-white/70 mb-3">Recent team summaries</h3>
        {initialReports.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/5 py-8 text-center">
            <p className="text-white/40 text-sm">No team summaries yet</p>
          </div>
        ) : (
          <div className="rounded-xl border border-white/10 bg-white/5 divide-y divide-white/10 overflow-hidden">
            {initialReports.map((r) => (
              <Link key={r.id} href={`/ai/reports/${r.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-white/5 transition-colors">
                <div className="min-w-0">
                  <p className="text-sm text-white font-medium truncate">{r.title}</p>
                  <p className="text-xs text-white/40 mt-0.5">{r.generatedByName} · {formatDistanceToNow(new Date(r.createdAt), { addSuffix: true })}</p>
                </div>
                <ArrowRight className="h-4 w-4 text-white/30 shrink-0" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
