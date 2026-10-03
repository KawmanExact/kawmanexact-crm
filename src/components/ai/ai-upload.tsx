'use client'

import * as React from 'react'
import { Upload, FileText, Image as ImageIcon, Table2, X, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export type UploadedFileInfo = {
  name: string
  mimeType: string
  size: number
  kind: string
  snippet: string
  truncated: boolean
  pages?: number
  sheetName?: string
  totalRows?: number
  charts?: Array<{
    title: string
    type: 'bar' | 'line' | 'pie'
    xKey: string
    yKeys: string[]
    data: Record<string, unknown>[]
  }>
  imageBase64?: string
}

export function AiUpload({
  files,
  uploading,
  onFilesSelected,
  onRemove,
  disabled,
}: {
  files: UploadedFileInfo[]
  uploading: boolean
  onFilesSelected: (list: FileList) => void
  onRemove: (idx: number) => void
  disabled?: boolean
}) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = React.useState(false)

  const accept = '.pdf,.xlsx,.xls,.csv,image/*'

  return (
    <div className="space-y-2">
      { }
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault(); setDragOver(false)
          if (disabled || uploading) return
          if (e.dataTransfer.files?.length) onFilesSelected(e.dataTransfer.files)
        }}
        onClick={() => !disabled && !uploading && inputRef.current?.click()}
        className={cn(
          'flex items-center gap-3 rounded-xl border border-dashed px-3 py-2.5 text-xs cursor-pointer transition-colors',
          dragOver ? 'border-violet-500/60 bg-violet-500/10' : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/15',
          (disabled || uploading) && 'opacity-50 pointer-events-none'
        )}
      >
        {uploading ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-white/50" /> : <Upload className="h-4 w-4 shrink-0 text-white/40" />}
        <span className="text-white/60">
          {uploading ? 'Extracting…' : 'Drop PDF / image / Excel / CSV here or click to browse'}
        </span>
        <span className="ml-auto hidden sm:inline text-[10px] text-white/25">PDF · images · .xlsx · .csv · max 10 MB</span>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) { onFilesSelected(e.target.files); e.target.value = '' }
        }}
      />

      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((f, i) => (
            <span key={`${f.name}-${i}`} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] pl-2 pr-1 py-1 text-xs text-white/70">
              {f.kind === 'pdf' ? <FileText className="h-3.5 w-3.5 text-red-300/70" /> : f.kind === 'image' ? <ImageIcon className="h-3.5 w-3.5 text-emerald-300/70" /> : f.kind === 'sheet' ? <Table2 className="h-3.5 w-3.5 text-sky-300/70" /> : <FileText className="h-3.5 w-3.5" />}
              <span className="max-w-[14ch] truncate">{f.name}</span>
              {f.kind === 'sheet' && f.totalRows != null && <span className="text-white/30">· {f.totalRows} rows</span>}
              {f.kind === 'pdf' && f.pages && <span className="text-white/30">· {f.pages}p</span>}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onRemove(i) }}
                className="ml-1 h-5 w-5 rounded-full hover:bg-white/10 flex items-center justify-center"
                aria-label={`Remove ${f.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
