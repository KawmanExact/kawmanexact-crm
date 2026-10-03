'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { FileText, Loader2, Check } from 'lucide-react'
import { saveTranscriptAction } from '@/app/meetings/actions'

export function TranscriptPanel({ meetingId, initialContent }: { meetingId: string; initialContent: string }) {
  const [content, setContent] = useState(initialContent)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  function handleSave() {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const result = await saveTranscriptAction(meetingId, content)
      if (result.error) setError(result.error)
      else setSaved(true)
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-white/70">
        <FileText className="h-4 w-4 text-white/40" />
        Transcript / notes
      </div>
      <textarea
        value={content}
        onChange={(e) => {
          setContent(e.target.value)
          setSaved(false)
        }}
        rows={10}
        placeholder="Paste the meeting transcript here (or type notes) — this is what the AI MoM generator reads from."
        className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500/50 font-mono"
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex items-center gap-3">
        <Button size="sm" variant="secondary" disabled={pending || !content.trim()} onClick={handleSave} className="gap-1.5">
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Save transcript
        </Button>
        {saved && <span className="text-xs text-emerald-400">Saved</span>}
      </div>
    </div>
  )
}
