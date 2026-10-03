'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { X, Loader2, History, Download, RotateCcw, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatBytes, formatDateTime } from '@/lib/utils'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { listFileVersionsAction, restoreFileVersionAction } from '@/app/files/actions'
import type { FileVersionItem } from '@/services/file.service'

export function VersionHistoryDialog({
  fileId,
  fileName,
  onClose,
}: {
  fileId: string
  fileName: string
  onClose: () => void
}) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [versions, setVersions] = useState<FileVersionItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [pending, startTransition] = useTransition()

  function load() {
    listFileVersionsAction(fileId)
      .then(setVersions)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load version history'))
  }

  useEffect(load, [fileId])

  async function handleReplace(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    setError(null)
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch(`/api/files/${fileId}/replace`, { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to upload new version')
      load()
      router.refresh(); window.dispatchEvent(new Event('storage:refresh'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const [confirmVersionId, setConfirmVersionId] = useState<string | null>(null)

  function handleRestore(versionId: string) {
    startTransition(async () => {
      const result = await restoreFileVersionAction(fileId, versionId)
      if (result.error) setError(result.error)
      else {
        load()
        router.refresh(); window.dispatchEvent(new Event('storage:refresh'))
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-white/10 bg-[#0a111c] p-5 shadow-xl max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-white font-semibold flex items-center gap-2">
            <History className="h-4 w-4 text-purple-400" />
            Version history
          </h3>
          <button onClick={onClose} className="text-white/40 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-xs text-white/40 mb-4 truncate">{fileName}</p>

        <input ref={inputRef} type="file" className="hidden" onChange={(e) => handleReplace(e.target.files)} />
        <Button
          size="sm"
          variant="ghost"
          className="w-full gap-1.5 mb-4"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          {uploading ? 'Uploading…' : 'Upload new version'}
        </Button>

        {versions === null ? (
          <p className="text-sm text-white/40 py-4 text-center">Loading…</p>
        ) : (
          <ul className="space-y-2">
            {versions.map((v) => (
              <li
                key={v.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm text-white/80 truncate">
                    v{v.versionNumber} {v.isCurrent && <span className="text-emerald-400 text-xs">· current</span>}
                  </p>
                  <p className="text-xs text-white/40">
                    {formatBytes(v.fileSize)} · {formatDateTime(v.createdAt)} · {v.uploadedBy}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <a
                    href={v.secureUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="h-7 w-7 rounded-md flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-colors"
                    title="Download"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </a>
                  {!v.isCurrent && (
                    <button
                      onClick={() => setConfirmVersionId(v.id)}
                      disabled={pending}
                      className="h-7 w-7 rounded-md flex items-center justify-center text-white/40 hover:text-purple-400 hover:bg-white/10 transition-colors"
                      title="Restore this version"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {error && <p className="text-xs text-red-400 mt-3">{error}</p>}
      </div>
      <ConfirmDialog
        open={!!confirmVersionId}
        onOpenChange={(o) => !o && setConfirmVersionId(null)}
        title="Restore this version?"
        description="The current content will be saved as a new version so you can undo."
        confirmLabel="Restore"
        onConfirm={() => confirmVersionId && handleRestore(confirmVersionId)}
        loading={pending}
      />
    </div>
  )
}
