'use client'

import { useState } from 'react'
import { Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ImportLeadsDialog } from './import-leads-dialog'

export function ImportLeadsButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
        <Upload className="h-3.5 w-3.5" />
        Import CSV
      </Button>
      {open && <ImportLeadsDialog onClose={() => setOpen(false)} />}
    </>
  )
}
