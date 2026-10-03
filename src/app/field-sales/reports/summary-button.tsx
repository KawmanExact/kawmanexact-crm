'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Loader2, Sparkles } from 'lucide-react'

export function FieldSalesDailySummaryButton() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function handle() {
    setLoading(true)
    setErr(null)
    try {
      const res = await fetch('/api/ai/field-daily-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      router.push(`/ai/reports/${data.id}`)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="outline" onClick={handle} disabled={loading} className="gap-1.5 h-9 border-white/10 text-xs">
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
        AI Daily Sales Summary
      </Button>
      {err && <span className="text-[11px] text-red-400 max-w-[220px] text-right leading-tight">{err}</span>}
    </div>
  )
}
