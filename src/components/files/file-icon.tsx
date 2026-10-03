import { FileImage, FileVideo, FileAudio, FileText, FileArchive, FileSpreadsheet, File as FileIcon } from 'lucide-react'
import type { ComponentType } from 'react'

export function fileIconFor(mimeType: string): ComponentType<{ className?: string }> {
  if (mimeType.startsWith('image/')) return FileImage
  if (mimeType.startsWith('video/')) return FileVideo
  if (mimeType.startsWith('audio/')) return FileAudio
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType === 'text/csv') return FileSpreadsheet
  if (mimeType.includes('zip') || mimeType.includes('compressed') || mimeType.includes('tar')) return FileArchive
  if (mimeType === 'application/pdf' || mimeType.startsWith('text/') || mimeType.includes('document')) return FileText
  return FileIcon
}
