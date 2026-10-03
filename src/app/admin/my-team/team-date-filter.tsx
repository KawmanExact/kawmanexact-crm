'use client'

import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

const PRESETS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'custom', label: 'Custom Range' },
] as const

export function TeamDateFilter({ preset, from, to }: { preset: string; from?: string; to?: string }) {
  const router = useRouter()

  function pushPreset(next: string) {
    if (next === 'custom') return
    const params = new URLSearchParams(window.location.search)
    params.set('preset', next)
    params.delete('from')
    params.delete('to')
    router.push(`?${params.toString()}`)
  }

  function pushCustom() {
    const f = (document.getElementById('team-from') as HTMLInputElement | null)?.value
    const t = (document.getElementById('team-to') as HTMLInputElement | null)?.value
    const params = new URLSearchParams(window.location.search)
    params.set('preset', 'custom')
    if (f) params.set('from', f)
    else params.delete('from')
    if (t) params.set('to', t)
    else params.delete('to')
    router.push(`?${params.toString()}`)
  }

  return (
    <Card className="p-3 bg-[#0a111c]/80 border-white/[0.08] flex flex-wrap items-center gap-3">
      <span className="text-sm text-white/60">Date range</span>
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <Button
            key={p.value}
            size="sm"
            variant={preset === p.value ? 'default' : 'outline'}
            onClick={() => (p.value === 'custom' ? pushCustom() : pushPreset(p.value))}
          >
            {p.label}
          </Button>
        ))}
      </div>
      <div className="flex items-center gap-2 ml-auto">
        <input id="team-from" type="date" defaultValue={from} className="h-8 rounded-md border border-white/10 bg-white/[0.04] px-2 text-sm text-white" />
        <span className="text-white/40">—</span>
        <input id="team-to" type="date" defaultValue={to} className="h-8 rounded-md border border-white/10 bg-white/[0.04] px-2 text-sm text-white" />
        <Button size="sm" variant="outline" onClick={pushCustom}>Apply</Button>
      </div>
    </Card>
  )
}
