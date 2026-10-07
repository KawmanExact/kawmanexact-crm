'use client'

import Link from 'next/link'
import { Building2, Clock, UserCheck } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { FollowUp } from '@/types/dashboard'

export function FollowUpList({ items }: { items: FollowUp[] }) {
  return (
    <Card className="bg-[#0a111c]/80 border-white/[0.08] flex flex-col h-full">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base font-semibold">Upcoming Follow-ups</CardTitle>
        <Link href="/follow-ups" className="text-sm text-purple-400 hover:text-purple-300 transition-colors shrink-0">
          View all
        </Link>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col">
        {items.length > 0 ? (
          <div className="space-y-1 flex-1 overflow-y-auto">
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
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-center py-8 flex-1">
            <div className="h-12 w-12 rounded-full bg-white/[0.05] flex items-center justify-center mb-3">
              <Clock className="h-6 w-6 text-white/40" />
            </div>
            <p className="text-sm font-medium text-white/60">No upcoming follow-ups</p>
            <p className="text-xs text-white/40 mt-1">You're all caught up for now</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}