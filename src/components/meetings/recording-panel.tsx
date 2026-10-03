'use client'

import { useState, useTransition } from 'react'
import { Video, Plus, Loader2, ExternalLink, AlertTriangle, Upload, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { addRecordingLinkAction } from '@/app/meetings/actions'
import { uploadVideoDirect } from '@/lib/cloudinary-client'
import type { MeetingRecording } from '@/types/meetings'

export function RecordingPanel({ meetingId, recordings }: { meetingId: string; recordings: MeetingRecording[] }) {
  const [url, setUrl] = useState('')
  const [showForm, setShowForm] = useState(recordings.length === 0)
  const [showUpload, setShowUpload] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState<{ loaded: number; total: number } | null>(null)

  function handleAddLink() {
    setError(null)
    startTransition(async () => {
      const result = await addRecordingLinkAction(meetingId, url)
      if (result.error) setError(result.error)
      else {
        setUrl('')
        setShowForm(false)
        window.dispatchEvent(new Event('storage:refresh'))
      }
    })
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setError(null)
    setUploadProgress({ loaded: 0, total: file.size })

    try {
      const upload = await uploadVideoDirect(file, (loaded, total) => setUploadProgress({ loaded, total }))

      const res = await fetch(`/api/meetings/${meetingId}/upload-recording`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicId: upload.public_id, secureUrl: upload.secure_url, bytes: upload.bytes }),
      })
      const result = await res.json().catch(() => ({}))

      if (!res.ok || result.error) {
        setError(result.error || 'Upload failed. Please try again.')
      } else {
        setShowUpload(false)
        setUploadProgress(null)
        e.target.value = ''
        window.dispatchEvent(new Event('storage:refresh'))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed. Please check your connection.')
    } finally {
      setUploadProgress(null)
    }
  }

  function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-white/70">
          <Video className="h-4 w-4 text-white/40" />
          Recording
        </div>
        <div className="flex items-center gap-2">
          {!showForm && !showUpload && (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="text-xs text-purple-400 hover:text-purple-300 inline-flex items-center gap-1"
            >
              <Plus className="h-3 w-3" />
              Add link
            </button>
          )}
          {!showForm && !showUpload && recordings.length > 0 && (
            <button
              type="button"
              onClick={() => setShowUpload(true)}
              className="text-xs text-purple-400 hover:text-purple-300 inline-flex items-center gap-1"
            >
              <Upload className="h-3 w-3" />
              Upload video
            </button>
          )}
        </div>
      </div>

      {recordings.length === 0 && !showForm && !showUpload && <p className="text-sm text-white/35">No recording linked yet</p>}

      {recordings.map((r) => (
        <a
          key={r.id}
          href={r.secureUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-white/70 hover:bg-white/[0.06] transition-colors"
        >
          <span className="truncate">{r.secureUrl}</span>
          <ExternalLink className="h-3.5 w-3.5 shrink-0 text-white/40" />
        </a>
      ))}

      {showForm && (
        <div className="space-y-2 rounded-lg border border-white/[0.08] bg-white/[0.02] p-3">
          <div className="flex items-start gap-2 text-xs text-amber-300/80 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2.5 py-2">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>
              Direct upload lands with the Cloudinary file-management integration. For now, paste a video URL (e.g. a
              Cloudinary link you already have).
            </span>
          </div>
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://res.cloudinary.com/..." />
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex gap-2">
            <Button size="sm" disabled={pending || !url.trim()} onClick={handleAddLink} className="gap-1.5">
              {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Add recording
            </Button>
            {recordings.length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            )}
          </div>
        </div>
      )}

      {showUpload && (
        <div className="space-y-2 rounded-lg border border-white/[0.08] bg-white/[0.02] p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-white">Upload Video File</span>
            <button
              type="button"
              onClick={() => { setShowUpload(false); setUploadProgress(null); }}
              className="text-white/40 hover:text-white/70"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex items-start gap-2 text-xs text-amber-300/80 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2.5 py-2">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>
              Upload a video file (MP4, WebM, MOV, AVI, MKV up to 500MB). After upload, transcription and AI-generated
              MoM will start automatically.
            </span>
          </div>
          <input
            type="file"
            accept="video/mp4,video/webm,video/quicktime,video/x-msvideo,video/x-matroska"
            onChange={handleFileUpload}
            className="w-full text-sm text-white/70 file:mr-4 file:py-1 file:px-3 file:rounded-lg file:border file:border-white/[0.1] file:bg-white/[0.05] file:text-white/70 hover:file:bg-white/[0.1]"
            disabled={pending}
          />
          {uploadProgress && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-white/50">
                <span>Uploading...</span>
                <span>{formatBytes(uploadProgress.loaded)} / {formatBytes(uploadProgress.total)}</span>
              </div>
              <div className="h-2 bg-white/[0.1] rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-500 transition-all duration-300"
                  style={{ width: `${(uploadProgress.loaded / uploadProgress.total) * 100}%` }}
                />
              </div>
            </div>
          )}
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex gap-2">
            {recordings.length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => { setShowUpload(false); setUploadProgress(null); }}>
                Cancel
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
