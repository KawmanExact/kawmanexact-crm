'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Trash2, Check, X, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { renameMeetingAction, deleteMeetingAction } from '@/app/meetings/actions'

export function MeetingHeaderActions({ meetingId, title }: { meetingId: string; title: string }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(title)
  const [pending, start] = useTransition()
  const [deleting, startDeleting] = useTransition()
  const [confirmOpen, setConfirmOpen] = useState(false)

  function handleRename() {
    const t = value.trim()
    if (t.length < 2) { toast.error('Title must be at least 2 characters'); return }
    if (t === title) { setEditing(false); return }
    start(async () => {
      const res = await renameMeetingAction(meetingId, t)
      if (res?.error) toast.error(res.error)
      else { toast.success('Meeting renamed'); setEditing(false); router.refresh(); window.dispatchEvent(new Event('storage:refresh')) }
    })
  }

  function handleDelete() {
    startDeleting(async () => {
      const res = await deleteMeetingAction(meetingId)
      if (res?.error) toast.error(res.error)
      else { toast.success('Meeting deleted'); window.dispatchEvent(new Event('storage:refresh')); router.push('/meetings') }
    })
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <Input value={value} onChange={(e) => setValue(e.target.value)} className="h-8 w-56" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') { setValue(title); setEditing(false) }}} />
        <Button size="sm" onClick={handleRename} disabled={pending} className="gap-1.5 h-8">
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Save
        </Button>
        <Button size="sm" variant="ghost" onClick={() => { setValue(title); setEditing(false) }} className="h-8 gap-1.5"><X className="h-3.5 w-3.5" /> Cancel</Button>
      </div>
    )
  }

  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setEditing(true)} className="gap-1.5">
        <Pencil className="h-3.5 w-3.5" /> Rename
      </Button>
      <Button size="sm" variant="destructive" onClick={() => setConfirmOpen(true)} className="gap-1.5" disabled={deleting}>
        <Trash2 className="h-3.5 w-3.5" /> Delete
      </Button>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Delete "${title}"?`}
        description="This will permanently delete the meeting, its recordings, transcript and MoM. This cannot be undone."
        confirmLabel="Delete meeting"
        variant="destructive"
        loading={deleting}
        onConfirm={handleDelete}
      />
    </>
  )
}
