'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { FolderPlus, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createFolderAction } from '@/app/files/actions'

export function CreateFolderButton({ parentId }: { parentId: string | null }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleCreate() {
    setError(null)
    startTransition(async () => {
      const result = await createFolderAction(name, parentId)
      if (result.error) {
        setError(result.error)
      } else {
        setName('')
        setOpen(false)
        router.refresh()
      }
    })
  }

  if (!open) {
    return (
      <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => setOpen(true)}>
        <FolderPlus className="h-4 w-4" />
        New folder
      </Button>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleCreate()
          if (e.key === 'Escape') setOpen(false)
        }}
        placeholder="Folder name"
        className="h-8 w-40"
      />
      <Button size="sm" disabled={pending || !name.trim()} onClick={handleCreate}>
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Create'}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
        Cancel
      </Button>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  )
}
