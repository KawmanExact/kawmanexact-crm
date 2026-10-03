'use client'

import * as React from 'react'
import { useActionState, useTransition, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { createMeetingWithVideoAction, type CreateMeetingWithVideoState } from '../actions'
import { uploadVideoDirect } from '@/lib/cloudinary-client'
import type { UserOption } from '@/services/user.service'

const initialState: CreateMeetingWithVideoState = {}

const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska']
const MAX_VIDEO_SIZE = 500 * 1024 * 1024

export function NewMeetingForm({
  users,
  currentUserId,
}: {
  users: UserOption[]
  currentUserId: string
}) {
  const [state, formAction, formPending] = useActionState(createMeetingWithVideoAction, initialState)
  const [isMutating, startTransition] = useTransition()
  const router = useRouter()
  useEffect(() => {
    if (state.error) toast.error(state.error)
    if (state.meetingId) {
      window.dispatchEvent(new Event('storage:refresh'))
      toast.success('Meeting uploaded — opening MoM…')
      router.push(`/meetings/${state.meetingId}`)
    }
  }, [state.error, state.meetingId, router])
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([currentUserId])
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<{ loaded: number; total: number } | null>(null)

  function toggleParticipant(id: string) {
    setSelectedParticipants((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]))
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()

    const fd = new FormData(e.currentTarget)
    const file = fd.get('videoFile')

    if (!file || !(file instanceof File)) {
      toast.error('Please select a video file')
      return
    }
    if (!ALLOWED_VIDEO_TYPES.includes(file.type)) {
      toast.error('Invalid file type. Please upload MP4, WebM, MOV, AVI, or MKV files.')
      return
    }
    if (file.size > MAX_VIDEO_SIZE) {
      toast.error('Video file exceeds 500MB limit')
      return
    }

    try {
      setIsUploading(true)
      setUploadProgress({ loaded: 0, total: file.size })

      const upload = await uploadVideoDirect(file, (loaded, total) => setUploadProgress({ loaded, total }))

      fd.delete('videoFile')
      fd.set('videoUrl', upload.secure_url)
      fd.set('videoPublicId', upload.public_id)
      fd.set('videoBytes', String(upload.bytes))

      startTransition(() => {
        formAction(fd)
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setIsUploading(false)
      setUploadProgress(null)
    }
  }

  const isBusy = isUploading || formPending || isMutating

  return (
    <Card className="bg-[#0a111c]/80 border-white/[0.08] p-6">
      <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <input type="hidden" name="participantIds" value={selectedParticipants.join(',')} />

        <Field label="Meeting title *" error={state.fieldErrors?.title}>
          <Input name="title" placeholder="Q3 renewal discussion" required />
        </Field>

        <Field label="Video file *" error={state.fieldErrors?.videoFile}>
          <input
            type="file"
            name="videoFile"
            accept="video/mp4,video/webm,video/quicktime,video/x-msvideo,video/x-matroska"
            required
            className="w-full text-sm text-white/70 file:mr-4 file:py-1 file:px-3 file:rounded-lg file:border file:border-white/[0.1] file:bg-white/[0.05] file:text-white/70 hover:file:bg-white/[0.1]"
          />
          <p className="text-xs text-white/40 mt-1">MP4, WebM, MOV, AVI, MKV (max 500MB)</p>
        </Field>

        <Field label="Company" error={state.fieldErrors?.company}>
          <Input name="company" placeholder="Acme Nutraceuticals" />
        </Field>
        <Field label="Contact Name" error={state.fieldErrors?.contactName}>
          <Input name="contactName" placeholder="Jane Doe" />
        </Field>
        <Field label="Contact Email" error={state.fieldErrors?.contactEmail}>
          <Input name="contactEmail" type="email" placeholder="jane@example.com" />
        </Field>
        <Field label="Contact Mobile" error={state.fieldErrors?.contactMobile}>
          <Input name="contactMobile" placeholder="+91 98765 43210" />
        </Field>
        <Field label="Deal" error={state.fieldErrors?.dealId}>
          <select
            name="dealId"
            defaultValue=""
            className="h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
          >
            <option value="">No deal</option>
          </select>
        </Field>

        <div className="sm:col-span-2 space-y-1.5">
          <label className="text-sm text-white/70">Participants</label>
          <div className="flex flex-wrap gap-2">
            {users.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => toggleParticipant(u.id)}
                className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                  selectedParticipants.includes(u.id)
                    ? 'bg-purple-500/20 border-purple-500/40 text-purple-200'
                    : 'bg-white/[0.03] border-white/10 text-white/60 hover:bg-white/10'
                }`}
              >
                {u.name}
              </button>
            ))}
          </div>
        </div>

        <div className="sm:col-span-2 space-y-1.5">
          <label className="text-sm text-white/70">Notes</label>
          <textarea
            name="notes"
            rows={3}
            placeholder="Agenda or context for this meeting..."
            className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
          />
        </div>

        {uploadProgress && (
          <div className="sm:col-span-2 space-y-1">
            <div className="flex justify-between text-xs text-white/50">
              <span>Uploading video…</span>
              <span>
                {formatBytes(uploadProgress.loaded)} / {formatBytes(uploadProgress.total)}
              </span>
            </div>
            <div className="h-2 bg-white/[0.1] rounded-full overflow-hidden">
              <div
                className="h-full bg-purple-500 transition-all duration-300"
                style={{ width: `${Math.min(100, (uploadProgress.loaded / uploadProgress.total) * 100)}%` }}
              />
            </div>
          </div>
        )}

        {state.error && (
          <div className="sm:col-span-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {state.error}
          </div>
        )}

        <div className="sm:col-span-2 flex justify-end">
          <Button type="submit" loading={isBusy} disabled={isBusy}>
            {isUploading ? 'Uploading…' : formPending ? 'Creating meeting…' : 'Upload meeting'}
          </Button>
        </div>
      </form>
    </Card>
  )
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
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
