'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function GoBackButton() {
  const router = useRouter()

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => router.back()}
      className="inline-flex items-center gap-1.5"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      Go back
    </Button>
  )
}
