'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { Folder, Trash2, Shield } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { deleteFolderAction } from '@/app/files/actions'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { FolderAccessDialog } from '@/components/files/folder-access-dialog'
import type { FolderItem } from '@/types/files'
import type { UserOption } from '@/services/user.service'

export function FolderGrid({ folders, users = [] }: { folders: FolderItem[]; users?: UserOption[] }) {
  const [pending, startTransition] = useTransition()
  const [accessDialogFolder, setAccessDialogFolder] = useState<FolderItem | null>(null)
  const [confirmFolder, setConfirmFolder] = useState<FolderItem | null>(null)

  if (folders.length === 0) return null

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      {folders.map((f) => (
        <Card
          key={f.id}
          className="bg-[#0a111c]/80 border-white/[0.08] p-4 group relative hover:bg-white/[0.04] transition-colors"
        >
          <Link href={`/files/my-files?folder=${f.id}`} className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-500/15 border border-amber-500/25 flex items-center justify-center shrink-0">
              <Folder className="h-5 w-5 text-amber-400" />
            </div>
            <div className="min-w-0">
              <p className="text-sm text-white font-medium truncate">{f.name}</p>
              <p className="text-xs text-white/40 mt-0.5">{f.fileCount} files</p>
            </div>
          </Link>
          <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                setAccessDialogFolder(f)
              }}
              className="h-6 w-6 rounded-md flex items-center justify-center text-white/40 hover:!text-purple-400 hover:bg-white/10 transition-colors"
              title="Manage access"
            >
              <Shield className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={(e) => {
                e.preventDefault()
                setConfirmFolder(f)
              }}
              className="h-6 w-6 rounded-md flex items-center justify-center text-white/40 hover:!text-red-400 hover:bg-white/10 transition-colors"
              title="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </Card>
      ))}

      {accessDialogFolder && (
        <FolderAccessDialog
          folderId={accessDialogFolder.id}
          folderName={accessDialogFolder.name}
          users={users}
          onClose={() => setAccessDialogFolder(null)}
        />
      )}
      <ConfirmDialog
        open={!!confirmFolder}
        onOpenChange={(o) => !o && setConfirmFolder(null)}
        title={confirmFolder ? `Delete folder "${confirmFolder.name}"?` : 'Delete folder?'}
        description="Files inside will move to the root."
        confirmLabel="Delete"
        variant="destructive"
        loading={pending}
        onConfirm={() => confirmFolder && startTransition(() => deleteFolderAction(confirmFolder.id))}
      />
    </div>
  )
}

