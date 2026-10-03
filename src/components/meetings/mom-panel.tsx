'use client'

import { useState, useTransition } from 'react'
import {
  Sparkles,
  Loader2,
  MessageSquare,
  ClipboardList,
  ShieldAlert,
  TrendingUp,
  TrendingDown,
  ListChecks,
  ArrowRightCircle,
  Pencil,
  Check,
  Trash2,
  AlertTriangle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { generateMomAction, editMomSummaryAction, deleteMomAction } from '@/app/meetings/actions'
import type { MeetingSummaryData } from '@/types/meetings'

interface Section {
  key: keyof MeetingSummaryData
  label: string
  icon: React.ReactNode
  tone: string
}

const SECTIONS: Section[] = [
  { key: 'discussionPoints', label: 'Discussion points', icon: <MessageSquare className="h-3.5 w-3.5" />, tone: 'text-white/60' },
  { key: 'requirements', label: 'Requirements', icon: <ClipboardList className="h-3.5 w-3.5" />, tone: 'text-blue-300' },
  { key: 'buyingSignals', label: 'Buying signals', icon: <TrendingUp className="h-3.5 w-3.5" />, tone: 'text-emerald-300' },
  { key: 'objections', label: 'Objections', icon: <ShieldAlert className="h-3.5 w-3.5" />, tone: 'text-orange-300' },
  { key: 'riskSignals', label: 'Risk signals', icon: <TrendingDown className="h-3.5 w-3.5" />, tone: 'text-red-300' },
  { key: 'actionItems', label: 'Action items', icon: <ListChecks className="h-3.5 w-3.5" />, tone: 'text-purple-300' },
  { key: 'nextSteps', label: 'Next steps', icon: <ArrowRightCircle className="h-3.5 w-3.5" />, tone: 'text-white/60' },
]

export function MomPanel({
  meetingId,
  summary,
  canGenerate,
  aiConfigured,
}: {
  meetingId: string
  summary: MeetingSummaryData | null
  canGenerate: boolean
  aiConfigured: boolean
}) {
  const [generating, startGenerate] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(summary?.summary ?? '')
  const [savingEdit, startSavingEdit] = useTransition()
  const [deletingMom, startDeletingMom] = useTransition()
  const [confirmDeleteMom, setConfirmDeleteMom] = useState(false)

  function handleGenerate() {
    setError(null)
    startGenerate(async () => {
      const result = await generateMomAction(meetingId)
      if (result.error) setError(result.error)
      else window.dispatchEvent(new Event('storage:refresh'))
    })
  }

  function handleSaveEdit() {
    startSavingEdit(async () => {
      const result = await editMomSummaryAction(meetingId, editValue)
      if (result.error) setError(result.error)
      else setEditing(false)
    })
  }

  function handleDeleteMom() {
    setError(null)
    startDeletingMom(async () => {
      const result = await deleteMomAction(meetingId)
      if (result.error) setError(result.error)
      else { window.dispatchEvent(new Event('storage:refresh')); window.location.reload() }
    })
  }

  if (!aiConfigured) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
        <div>
          <p className="font-medium">AI MoM generation isn&apos;t configured yet</p>
          <p className="text-amber-200/70 text-xs mt-1">
            Set <code className="text-amber-100">OPENAI_API_KEY</code> or{' '}
            <code className="text-amber-100">GOOGLE_GENERATIVE_AI_API_KEY</code> to enable it.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-white/70">
          <Sparkles className="h-4 w-4 text-purple-300" />
          AI-generated Minutes of Meeting
        </div>
        <div className="flex items-center gap-2">
          {summary && (
            <Button size="sm" variant="ghost" disabled={deletingMom} onClick={() => setConfirmDeleteMom(true)} className="gap-1.5 text-white/60 hover:text-red-300">
              {deletingMom ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Delete MoM
            </Button>
          )}
          <Button size="sm" disabled={!canGenerate || generating} onClick={handleGenerate} className="gap-1.5">
            {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {summary ? 'Regenerate' : 'Generate MoM'}
          </Button>
        </div>
      </div>

      {!canGenerate && !summary && (
        <p className="text-sm text-white/35">Add a transcript or notes above, then generate the MoM.</p>
      )}

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {summary && (
        <div className="space-y-5">
          <div className="rounded-xl border border-purple-500/20 bg-purple-500/[0.06] p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-purple-300 uppercase tracking-wide">Summary</p>
              {!editing && (
                <button
                  type="button"
                  onClick={() => {
                    setEditValue(summary.summary)
                    setEditing(true)
                  }}
                  className="text-xs text-white/40 hover:text-white inline-flex items-center gap-1"
                >
                  <Pencil className="h-3 w-3" />
                  Edit
                </button>
              )}
            </div>
            {editing ? (
              <div className="space-y-2">
                <textarea
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                />
                <div className="flex gap-2">
                  <Button size="sm" disabled={savingEdit} onClick={handleSaveEdit} className="gap-1.5">
                    {savingEdit ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-white/80 text-sm leading-relaxed">{summary.summary}</p>
            )}
            {summary.isEdited && <p className="text-[11px] text-white/30 mt-2">Manually edited</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {SECTIONS.map((section) => {
              const items = summary[section.key] as string[]
              if (!items || items.length === 0) return null
              return (
                <div key={section.key} className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
                  <p className={`text-xs font-semibold uppercase tracking-wide mb-2 flex items-center gap-1.5 ${section.tone}`}>
                    {section.icon}
                    {section.label}
                  </p>
                  <ul className="space-y-1.5">
                    {items.map((item, i) => (
                      <li key={i} className="text-sm text-white/70 flex gap-2">
                        <span className="text-white/25">·</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
        </div>
      )}
      <ConfirmDialog
        open={confirmDeleteMom}
        onOpenChange={setConfirmDeleteMom}
        title="Delete MoM?"
        description="This will delete the AI-generated summary and its insights for this meeting. The transcript and recording stay intact — you can regenerate the MoM later."
        confirmLabel="Delete MoM"
        variant="destructive"
        loading={deletingMom}
        onConfirm={handleDeleteMom}
      />
    </div>
  )
}
