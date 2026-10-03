'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, Loader2, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function UploadButton({ folderId, cloudinaryConfigured = true }: { folderId: string | null; cloudinaryConfigured?: boolean }) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setError(null)
    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData()
        formData.append('file', file)
        if (folderId) formData.append('folderId', folderId)
        const res = await fetch('/api/files/upload', { method: 'POST', body: formData })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || `Failed to upload ${file.name}`)
      }
      router.refresh()
      window.dispatchEvent(new Event('storage:refresh'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  if (!cloudinaryConfigured) {
    return (
      <div className="flex items-center gap-2 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        Cloudinary not configured
      </div>
    )
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <Button size="sm" className="gap-1.5" disabled={uploading} onClick={() => inputRef.current?.click()}>
        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        {uploading ? 'Uploading…' : 'Upload'}
      </Button>
      {error && <span className="text-xs text-red-400 max-w-xs text-right">{error}</span>}
    </div>
  )
}
