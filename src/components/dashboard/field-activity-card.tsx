'use client'

import Link from 'next/link'
import { UserCheck, Users, MapPinCheck, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { FieldActivityMetric } from '@/types/dashboard'

const ICONS = {
  checkin: UserCheck,
  meeting: Users,
  geo: MapPinCheck,
  mom: FileText,
} as const

const COLOR: Record<FieldActivityMetric['color'], { icon: string; bg: string }> = {
  green: { icon: 'text-emerald-400', bg: 'bg-emerald-500/15' },
  purple: { icon: 'text-purple-400', bg: 'bg-purple-500/15' },
  blue: { icon: 'text-blue-400', bg: 'bg-blue-500/15' },
  orange: { icon: 'text-orange-400', bg: 'bg-orange-500/15' },
}

export function FieldActivityCard({ metrics }: { metrics: FieldActivityMetric[] }) {
  return (
    <Card className="bg-[#0a111c]/80 border-white/[0.08]">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base font-semibold">Today&apos;s Field Activity</CardTitle>
        <Link href="/field-sales" className="text-sm text-purple-400 hover:text-purple-300 transition-colors">
          View all
        </Link>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3">
          {metrics.map((metric) => {
            const Icon = ICONS[metric.icon]
            const theme = COLOR[metric.color]
            return (
              <div key={metric.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                <div className={cn('h-8 w-8 rounded-lg flex items-center justify-center mb-2', theme.bg)}>
                  <Icon className={cn('h-4 w-4', theme.icon)} />
                </div>
                <p className="text-xl font-bold text-white leading-none">{metric.value}</p>
                <p className="text-xs text-white/50 mt-1">{metric.label}</p>
                <p className="text-[11px] text-white/35">{metric.sublabel}</p>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
