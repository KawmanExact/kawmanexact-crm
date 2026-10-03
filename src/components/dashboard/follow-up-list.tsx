'use client'

import Link from 'next/link'
import { Building2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { FollowUp } from '@/types/dashboard'

export function FollowUpList({ items }: { items: FollowUp[] }) {
  return (
    <Card className="bg-[#0a111c]/80 border-white/[0.08]">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base font-semibold">Upcoming Follow-ups</CardTitle>
        <Link href="/follow-ups" className="text-sm text-purple-400 hover:text-purple-300 transition-colors">
          View all
        </Link>
      </CardHeader>
      <CardContent className="space-y-1">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-3 rounded-lg p-2.5 hover:bg-white/[0.04] transition-colors"
          >
            <div className="h-9 w-9 shrink-0 rounded-lg bg-white/[0.06] flex items-center justify-center">
              <Building2 className="h-4.5 w-4.5 text-white/55" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-white truncate">{item.company}</p>
              <p className="text-xs text-white/45 truncate">{item.purpose}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm text-white/80">{item.dateLabel}</p>
              <p className="text-xs text-white/40">{item.timeLabel}</p>
            </div>
            <div
              className="h-7 w-7 rounded-full bg-purple-600/25 flex items-center justify-center text-[11px] font-medium text-purple-300 shrink-0"
              title={item.assigneeName}
            >
              {item.assigneeInitials}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
