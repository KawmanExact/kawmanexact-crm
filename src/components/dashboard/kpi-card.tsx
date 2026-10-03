'use client'

import { Users, DollarSign, MapPin, Bell, Trophy, ArrowUp, ArrowDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { Sparkline } from './sparkline'
import type { KpiMetric } from '@/types/dashboard'

const ICONS = {
  leads: Users,
  deals: DollarSign,
  visits: MapPin,
  followups: Bell,
  won: Trophy,
} as const

const THEME: Record<KpiMetric['icon'], { icon: string; iconBg: string; spark: string }> = {
  leads: { icon: 'text-purple-400', iconBg: 'bg-purple-500/15', spark: '#a78bfa' },
  deals: { icon: 'text-blue-400', iconBg: 'bg-blue-500/15', spark: '#60a5fa' },
  visits: { icon: 'text-emerald-400', iconBg: 'bg-emerald-500/15', spark: '#34d399' },
  followups: { icon: 'text-orange-400', iconBg: 'bg-orange-500/15', spark: '#fb923c' },
  won: { icon: 'text-purple-400', iconBg: 'bg-purple-500/15', spark: '#c084fc' },
}

export function KpiCard({ kpi }: { kpi: KpiMetric }) {
  const Icon = ICONS[kpi.icon]
  const theme = THEME[kpi.icon]

  return (
    <Card className="p-5 bg-[#0a111c]/80 border-white/[0.08]">
      <div className="flex items-start justify-between">
        <div className={cn('h-11 w-11 rounded-xl flex items-center justify-center', theme.iconBg)}>
          <Icon className={cn('h-5 w-5', theme.icon)} />
        </div>
      </div>
      <div className="mt-3">
        <p className="text-sm text-white/60">{kpi.label}</p>
        <p className="text-2xl font-bold text-white mt-0.5">{kpi.value}</p>
      </div>
      <div className="flex items-center gap-1 mt-1.5">
        {kpi.trendDirection === 'up' ? (
          <ArrowUp className="h-3.5 w-3.5 text-emerald-400" />
        ) : (
          <ArrowDown className="h-3.5 w-3.5 text-red-400" />
        )}
        <span
          className={cn(
            'text-xs font-medium',
            kpi.trendDirection === 'up' ? 'text-emerald-400' : 'text-red-400'
          )}
        >
          {kpi.trendLabel}
        </span>
      </div>
      <div className="mt-3 -mb-1">
        <Sparkline data={kpi.sparkline} color={theme.spark} />
      </div>
    </Card>
  )
}
