'use client'

import { useActionState, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, Sparkles, AlertTriangle, ClipboardCheck, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { createVisitReportAction, type VisitReportFormState } from '@/app/field-sales/actions'
import type { FieldVisit } from '@/types/field-sales'

const initialState: VisitReportFormState = {}

export function VisitReportForm({
  visits,
  aiConfigured,
  dailyReportExists,
}: {
  visits: Pick<FieldVisit, 'id' | 'title' | 'company' | 'scheduledAt'>[]
  aiConfigured: boolean
  dailyReportExists: boolean
}) {
  const router = useRouter()
  const [state, formAction, pending] = useActionState(createVisitReportAction, initialState)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiErr, setAiErr] = useState<string | null>(null)

  async function handleGenerateSalesSummary() {
    if (!state.success || !state.reportId) return
    setAiLoading(true)
    setAiErr(null)
    try {
      const res = await fetch('/api/ai/field-daily-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      router.push(`/ai/reports/${data.id}`)
    } catch (e) {
      setAiErr(e instanceof Error ? e.message : 'Failed')
    } finally {
      setAiLoading(false)
    }
  }

  if (state.success) {
    return (
      <Card className="bg-[#0a111c]/80 border-white/[0.08] p-6 space-y-4">
        <div className="flex items-center gap-2 text-emerald-400">
          <Badge variant="success">Saved</Badge>
          <span className="text-sm">Field report saved — linked to today&apos;s daily report.</span>
        </div>
        <p className="text-xs text-white/40">
          Your discussion notes were appended to <span className="text-white/70">Submit Daily Report</span> for today.
          {dailyReportExists ? ' Existing daily draft was updated.' : ' A draft daily report was created.'} You can review and submit it.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => router.push('/field-sales/reports')}>
            Back to reports
          </Button>
          <Button variant="outline" asChild>
            <Link href="/dashboard/daily-report">Open daily report</Link>
          </Button>
          <Button onClick={handleGenerateSalesSummary} disabled={!aiConfigured || aiLoading} className="gap-1.5">
            {aiLoading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating sales summary…
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" /> Generate AI sales summary
              </>
            )}
          </Button>
        </div>
        {!aiConfigured && (
          <p className="text-xs text-amber-200 bg-amber-500/10 border border-amber-500/20 rounded px-3 py-2 flex items-center gap-2">
            <AlertTriangle className="h-3 w-3" /> AI summary needs OPENAI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY.
          </p>
        )}
        {aiErr && <p className="text-xs text-red-400">{aiErr}</p>}
      </Card>
    )
  }

  return (
    <Card className="bg-[#0a111c]/80 border-white/[0.08] p-6">
      <form action={formAction} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm text-white/70">Visit *</label>
          {visits.length === 0 ? (
            <p className="text-xs text-amber-200 bg-amber-500/10 border border-amber-500/20 rounded px-3 py-2">
              No visits found. Create a visit first — the report needs a visit to link to.
            </p>
          ) : (
            <select
              name="visitId"
              defaultValue=""
              required
              className="w-full h-9 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
            >
              <option value="" disabled>
                Select a visit
              </option>
              {visits.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.title}
                  {v.company ? ` — ${v.company}` : ''} · {new Date(v.scheduledAt).toLocaleDateString('en-IN')}
                </option>
              ))}
            </select>
          )}
          {state.fieldErrors?.visitId && <p className="text-xs text-red-400">{state.fieldErrors.visitId}</p>}
        </div>

        <Field label="Purpose *" error={state.fieldErrors?.purpose}>
          <Input name="purpose" placeholder="e.g. Product demo, follow-up, negotiation" required />
        </Field>

        <Field label="What was discussed *" error={state.fieldErrors?.discussion}>
          <textarea
            name="discussion"
            rows={4}
            required
            placeholder="What did you discuss with the customer? Key points, objections, interests…"
            className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-sm text-white placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
          />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Customer requirements" error={state.fieldErrors?.requirements}>
            <textarea
              name="requirements"
              rows={3}
              placeholder="What does the customer need? Feature, volume, pricing…"
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-sm text-white placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
            />
          </Field>
          <Field label="Competitor info" error={state.fieldErrors?.competitorInfo}>
            <textarea
              name="competitorInfo"
              rows={3}
              placeholder="Any competitor mentions, pricing, comparison…"
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-sm text-white placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
            />
          </Field>
        </div>

        <Field label="Customer feedback" error={state.fieldErrors?.customerFeedback}>
          <textarea
            name="customerFeedback"
            rows={2}
            placeholder="Sentiment, concerns, appreciation…"
            className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-sm text-white placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
          />
        </Field>

        <Field label="Next steps — sales actions *" error={state.fieldErrors?.nextSteps}>
          <textarea
            name="nextSteps"
            rows={3}
            required
            placeholder="Follow-up call, proposal, demo, quote… with owner and date"
            className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-sm text-white placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
          />
        </Field>

        <p className="text-xs text-white/35 flex items-center gap-1.5">
          <ClipboardCheck className="h-3.5 w-3.5" /> This saves to <span className="text-white/60">Visit Reports</span> and auto-links to
          <span className="text-white/60"> Submit Daily Report</span> for today — so your daily sales summary can review it.
        </p>

        {state.error && <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">{state.error}</div>}

        <div className="flex justify-between gap-2 pt-1">
          <Button variant="ghost" asChild>
            <Link href="/field-sales/reports" className="gap-1.5">
              <ArrowLeft className="h-3.5 w-3.5" /> Cancel
            </Link>
          </Button>
          <Button type="submit" loading={pending} disabled={pending || visits.length === 0}>
            {pending ? 'Saving…' : 'Save field report'}
          </Button>
        </div>
      </form>
    </Card>
  )
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm text-white/70">{label}</label>
      {children}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}
