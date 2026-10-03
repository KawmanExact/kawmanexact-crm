'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { recalculateAllLeadScoresAction } from '@/app/leads/actions'

export function RecalculateAllScoresButton() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)

  function handleClick() {
    setMessage(null)
    startTransition(async () => {
      const result = await recalculateAllLeadScoresAction()
      if (result.error) setMessage(result.error)
      else {
        setMessage(`Updated ${result.updated} of ${result.total} leads.`)
        router.refresh()
      }
    })
  }

  return (
    <div className="flex items-center gap-2">
      <Button type="button" variant="ghost" size="sm" onClick={handleClick} disabled={pending} className="gap-1.5">
        <RotateCcw className={`h-3.5 w-3.5 ${pending ? 'animate-spin' : ''}`} />
        {pending ? 'Recalculating…' : 'Recalculate scores'}
      </Button>
      {message && <span className="text-xs text-white/40">{message}</span>}
    </div>
  )
}
