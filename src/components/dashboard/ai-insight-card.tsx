'use client'

import Link from 'next/link'
import { Sparkles, Flame, Clock, TrendingUp, Users } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { AIInsight } from '@/types/dashboard'

const ICONS = {
  flame: Flame,
  clock: Clock,
  trend: TrendingUp,
  meeting: Users,
} as const

export function AIInsightCard({
  summary,
  insights,
}: {
  summary: { title: string; description: string }
  insights: AIInsight[]
}) {
  return (
    <Card className="bg-[#0a111c]/80 border-white/[0.08]">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base font-semibold">AI CRM Insights</CardTitle>
        <Link href="/ai/reports" className="text-sm text-purple-400 hover:text-purple-300 transition-colors">
          View all
        </Link>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-xl border border-purple-500/30 bg-purple-500/[0.07] p-3 shadow-[0_0_24px_-8px_rgba(168,85,247,0.55)]">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 shrink-0 rounded-lg bg-purple-500/20 flex items-center justify-center shadow-[0_0_12px_rgba(168,85,247,0.5)]">
              <Sparkles className="h-4.5 w-4.5 text-purple-300" />
            </div>
            <div>
              <p className="text-sm font-semibold text-purple-300">{summary.title}</p>
              <p className="text-sm text-white/70 mt-0.5">{summary.description}</p>
            </div>
          </div>
        </div>

        <div className="space-y-1">
          {insights.map((insight) => {
            const Icon = ICONS[insight.icon]
            return (
              <div key={insight.id} className="flex items-start gap-3 rounded-lg p-2 hover:bg-white/[0.04] transition-colors">
                <div className="h-8 w-8 shrink-0 rounded-lg bg-white/[0.06] flex items-center justify-center">
                  <Icon className="h-4 w-4 text-white/60" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate">{insight.title}</p>
                  <p className="text-xs text-white/50 truncate">{insight.description}</p>
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
