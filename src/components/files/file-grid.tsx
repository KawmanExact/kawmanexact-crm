'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Star,
  Trash2,
  Share2,
  Download,
  RotateCcw,
  XCircle,
  MoreVertical,
  History,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { formatBytes, formatRelativeTime, cn } from '@/lib/utils'
import { fileIconFor } from './file-icon'
import { ShareDialog } from './share-dialog'
import { VersionHistoryDialog } from './version-history-dialog'
import {
  toggleStarAction,
  trashFileAction,
  restoreFileAction,
  permanentlyDeleteFileAction,
} from '@/app/files/actions'
import type { FileItem, SharedFileItem } from '@/types/files'
import type { UserOption } from '@/services/user.service'

type Mode = 'default' | 'trash'

export function FileGrid({
  files,
  mode = 'default',
  users,
  emptyLabel = 'No files here',
}: {
  files: (FileItem | SharedFileItem)[]
  mode?: Mode
  users?: UserOption[]
  emptyLabel?: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [shareTarget, setShareTarget] = useState<string | null>(null)
  const [versionTarget, setVersionTarget] = useState<{ id: string; name: string } | null>(null)

  function act(fn: () => Promise<void>) {
    startTransition(async () => {
      await fn()
      router.refresh()
      window.dispatchEvent(new Event('storage:refresh'))
    })
  }

  if (files.length === 0) {
    return (
      <Card className="bg-[#0a111c]/80 border-white/[0.08] py-14 text-center">
        <p className="text-white/40 text-sm">{emptyLabel}</p>
      </Card>
    )
  }

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {files.map((file) => {
          const Icon = fileIconFor(file.mimeType)
          const shared = 'sharedBy' in file ? file : null
          return (
            <Card
              key={file.id}
              className={cn(
                'bg-[#0a111c]/80 border-white/[0.08] p-4 flex flex-col gap-3 relative group',
                pending && 'opacity-60 pointer-events-none'
              )}
            >
              <div className="flex items-start justify-between">
                <div className="relative h-10 w-10 rounded-lg bg-white/[0.06] flex items-center justify-center overflow-hidden">
                  {file.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={file.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Icon className="h-5 w-5 text-white/50" />
                  )}
                  {file.isStarred && mode === 'default' && (
                    <Star className="h-3 w-3 text-amber-400 fill-amber-400 absolute -bottom-0.5 -right-0.5" />
                  )}
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="h-7 w-7 rounded-md flex items-center justify-center text-white/30 hover:text-white hover:bg-white/10 transition-colors">
                      <MoreVertical className="h-4 w-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                      <a href={`/api/files/${file.id}/download`} target="_blank" rel="noreferrer" className="flex items-center gap-2 cursor-pointer">
                        <Download className="h-3.5 w-3.5" />
                        Download
                      </a>
                    </DropdownMenuItem>
                    {mode === 'default' && (
                      <>
                        <DropdownMenuItem onClick={() => act(() => toggleStarAction(file.id, !file.isStarred))}>
                          <Star className="h-3.5 w-3.5" />
                          {file.isStarred ? 'Unstar' : 'Star'}
                        </DropdownMenuItem>
                        {users && (
                          <DropdownMenuItem onClick={() => setShareTarget(file.id)}>
                            <Share2 className="h-3.5 w-3.5" />
                            Share
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => setVersionTarget({ id: file.id, name: file.originalName })}>
                          <History className="h-3.5 w-3.5" />
                          Version history
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => act(() => trashFileAction(file.id))}
                          className="text-red-400 focus:text-red-300"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Move to trash
                        </DropdownMenuItem>
                      </>
                    )}
                    {mode === 'trash' && (
                      <>
                        <DropdownMenuItem onClick={() => act(() => restoreFileAction(file.id))}>
                          <RotateCcw className="h-3.5 w-3.5" />
                          Restore
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => act(() => permanentlyDeleteFileAction(file.id))}
                          className="text-red-400 focus:text-red-300"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          Delete permanently
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="min-w-0">
                <p className="text-sm text-white font-medium truncate" title={file.originalName}>
                  {file.originalName}
                </p>
                <p className="text-xs text-white/40 mt-0.5">
                  {formatBytes(file.fileSize)} · {formatRelativeTime(file.createdAt)}
                </p>
                {shared ? (
                  <p className="text-xs text-purple-300/70 mt-1">Shared by {shared.sharedBy}</p>
                ) : (
                  <p className="text-xs text-white/30 mt-1">{file.uploadedBy}</p>
                )}
              </div>
            </Card>
          )
        })}
      </div>

      {shareTarget && users && (
        <ShareDialog fileId={shareTarget} users={users} onClose={() => setShareTarget(null)} />
      )}
      {versionTarget && (
        <VersionHistoryDialog
          fileId={versionTarget.id}
          fileName={versionTarget.name}
          onClose={() => setVersionTarget(null)}
        />
      )}
    </>
  )
}
