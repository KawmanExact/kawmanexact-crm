'use client'

import { useState, useTransition } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

export function DeleteRowButton({
  action,
  confirmLabel = 'Delete this? This cannot be undone.',
  className,
}: {
  action: () => Promise<{ success?: boolean; error?: string } | void>
  confirmLabel?: string
  className?: string
}) {
  const [pending, startTransition] = useTransition()

  const [confirmOpen, setConfirmOpen] = useState(false)

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn('h-7 w-7 text-white/30 hover:text-red-400', className)}
        disabled={pending}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setConfirmOpen(true)
        }}
        title="Delete"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Delete?"
        description={confirmLabel}
        confirmLabel="Delete"
        variant="destructive"
        loading={pending}
        onConfirm={() =>
          startTransition(async () => {
            const res = (await action()) as { success?: boolean; error?: string } | void
            if (res && typeof res === 'object' && 'error' in res && res.error) toast.error(res.error)
            else if (res && typeof res === 'object' && 'success' in res && res.success) toast.success('Deleted')
          })
        }
      />
    </>
  )
}
