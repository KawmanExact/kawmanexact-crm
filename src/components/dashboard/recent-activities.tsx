'use client'

import Link from 'next/link'
import { UserCheck, Users, FileText, Target, Handshake } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { RecentActivity } from '@/types/dashboard'

const ICONS = {
  checkin: UserCheck,
  meeting: Users,
  mom: FileText,
  lead: Target,
  deal: Handshake,
} as const

const COLOR: Record<RecentActivity['color'], { icon: string; bg: string }> = {
  green: { icon: 'text-emerald-400', bg: 'bg-emerald-500/15' },
  purple: { icon: 'text-purple-400', bg: 'bg-purple-500/15' },
  orange: { icon: 'text-orange-400', bg: 'bg-orange-500/15' },
  blue: { icon: 'text-blue-400', bg: 'bg-blue-500/15' },
  pink: { icon: 'text-pink-400', bg: 'bg-pink-500/15' },
}

export function RecentActivities({ items }: { items: RecentActivity[] }) {
  return (
    <Card className="bg-[#0a111c]/80 border-white/[0.08]">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base font-semibold">Recent Activities</CardTitle>
        <Link href="/admin/activity" className="text-sm text-purple-400 hover:text-purple-300 transition-colors">
          View all
        </Link>
      </CardHeader>
      <CardContent className="space-y-1">
        {items.map((item) => {
          const Icon = ICONS[item.icon]
          const theme = COLOR[item.color]
          return (
            <div key={item.id} className="flex items-center gap-3 rounded-lg p-2 hover:bg-white/[0.04] transition-colors">
              <div className={cn('h-8 w-8 shrink-0 rounded-lg flex items-center justify-center', theme.bg)}>
                <Icon className={cn('h-4 w-4', theme.icon)} />
              </div>
              <p className="text-sm text-white/75 flex-1 min-w-0 truncate">{item.description}</p>
              <span className="text-xs text-white/35 whitespace-nowrap">{item.timeLabel}</span>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
