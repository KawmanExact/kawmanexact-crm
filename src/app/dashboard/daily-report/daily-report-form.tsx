'use client'

import { useActionState, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { submitDailyReportAction, type DailyReportFormState } from '@/app/admin/my-team/actions'
import type { DailyReportDraft } from '@/services/daily-report.service'
import { Loader2, Sparkles, AlertTriangle } from 'lucide-react'

const initialState: DailyReportFormState = {}

export function DailyReportForm({ draft, aiConfigured }: { draft: DailyReportDraft; aiConfigured: boolean }) {
  const router = useRouter()
  const [state, formAction, pending] = useActionState(submitDailyReportAction, initialState)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiErr, setAiErr] = useState<string | null>(null)
  const existing = draft.existingReport
  const todayStr = new Date().toISOString().slice(0, 10)

  async function handleGenerateSummary() {
    if (!state.success || !state.reportId) return
    setAiLoading(true)
    setAiErr(null)
    try {
      const res = await fetch('/api/ai/employee-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dailyReportId: state.reportId }),
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

  if (state.success && state.reportId) {
    return (
      <Card className="bg-[#0a111c]/80 border-white/[0.08] p-6 space-y-4">
        <div className="flex items-center gap-2 text-emerald-400">
          <Badge variant="success">Submitted</Badge>
          <span className="text-sm">Report submitted successfully.</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => router.push('/dashboard/my-profile')}>View my profile</Button>
          <Button variant="outline" onClick={() => router.push('/admin/my-team/reports')}>View team reports</Button>
          <Button
            onClick={handleGenerateSummary}
            disabled={!aiConfigured || aiLoading}
            className="gap-1.5"
          >
            {aiLoading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating summary…</> : <><Sparkles className="h-3.5 w-3.5" /> Generate AI summary</>}
          </Button>
        </div>
        {!aiConfigured && <p className="text-xs text-amber-200 bg-amber-500/10 border border-amber-500/20 rounded px-3 py-2 flex items-center gap-2"><AlertTriangle className="h-3 w-3" /> AI summary needs OPENAI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY.</p>}
        {aiErr && <p className="text-xs text-red-400">{aiErr}</p>}
      </Card>
    )
  }

  return (
    <Card className="bg-[#0a111c]/80 border-white/[0.08] p-6">
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="date" value={todayStr} />
        <Field label="Date" error={state.fieldErrors?.date}>
          <Input value={todayStr} disabled />
        </Field>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm">
          <StatPill label="Tasks (auto)" value={draft.tasksCompletedCount} />
          <StatPill label="CRM updates" value={draft.crmRecordsUpdatedCount} />
          <StatPill label="Leads worked" value={draft.leadsWorkedOnCount} />
          <StatPill label="Files uploaded" value={draft.filesUploadedCount} />
          <StatPill label="Active minutes" value={draft.activeWorkingTimeMinutes} />
        </div>
        <p className="text-xs text-white/40">Counts are pre-filled from today&apos;s activity — you can override them below when applicable.</p>

        <Field label="Work description" error={state.fieldErrors?.workDescription}>
          <textarea name="workDescription" defaultValue={existing?.workDescription ?? ''} rows={3} className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-purple-500/50" placeholder="What did you work on today?" />
        </Field>
        <Field label="Completed work" error={state.fieldErrors?.completedWork}>
          <textarea name="completedWork" defaultValue={existing?.completedWork ?? ''} rows={3} className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-purple-500/50" placeholder="What got done" />
        </Field>
        <Field label="Pending work" error={state.fieldErrors?.pendingWork}>
          <textarea name="pendingWork" defaultValue={existing?.pendingWork ?? ''} rows={2} className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-purple-500/50" placeholder="What is still pending" />
        </Field>
        <Field label="Blockers" error={state.fieldErrors?.blockers}>
          <textarea name="blockers" defaultValue={existing?.blockers ?? ''} rows={2} className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-purple-500/50" placeholder="Any blockers?" />
        </Field>
        <Field label="Tomorrow's plan" error={state.fieldErrors?.tomorrowPlan}>
          <textarea name="tomorrowPlan" defaultValue={existing?.tomorrowPlan ?? ''} rows={2} className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-purple-500/50" placeholder="Plan for tomorrow" />
        </Field>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <Field label="Tasks completed">
            <Input name="tasksCompletedCount" type="number" min={0} max={1000} defaultValue={existing?.tasksCompletedCount ?? draft.tasksCompletedCount} />
          </Field>
          <Field label="CRM updates">
            <Input name="crmRecordsUpdatedCount" type="number" min={0} max={10000} defaultValue={existing?.crmRecordsUpdatedCount ?? draft.crmRecordsUpdatedCount} />
          </Field>
          <Field label="Leads worked">
            <Input name="leadsWorkedOnCount" type="number" min={0} max={10000} defaultValue={existing?.leadsWorkedOnCount ?? draft.leadsWorkedOnCount} />
          </Field>
          <Field label="Files uploaded">
            <Input name="filesUploadedCount" type="number" min={0} max={10000} defaultValue={existing?.filesUploadedCount ?? draft.filesUploadedCount} />
          </Field>
          <Field label="Active minutes">
            <Input name="activeWorkingTimeMinutes" type="number" min={0} max={1440} defaultValue={existing?.activeWorkingTimeMinutes ?? draft.activeWorkingTimeMinutes} />
          </Field>
        </div>

        {state.error && <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">{state.error}</div>}
        <div className="flex justify-end gap-2">
          <Button type="submit" loading={pending} disabled={pending}>{pending ? 'Submitting…' : 'Submit report'}</Button>
        </div>
        <p className="text-xs text-white/35">Submitting here creates/updates the Daily Report for today. On success you can generate an Employee Daily Summary (AIReport, one per DailyReport).</p>
      </form>
    </Card>
  )
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><label className="text-sm text-white/70">{label}</label>{children}{error && <p className="text-xs text-red-400">{error}</p>}</div>
}
function StatPill({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg bg-white/[0.04] border border-white/[0.06] px-3 py-2"><p className="text-[11px] text-white/40 uppercase tracking-wide">{label}</p><p className="text-sm font-semibold text-white mt-0.5">{value}</p></div>
}
