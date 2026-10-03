'use client'

import Link from 'next/link'
import { TrendingUp } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { PipelineStage } from '@/types/dashboard'

export function PipelineCard({
  stages,
  conversionRate,
  conversionTrend,
}: {
  stages: PipelineStage[]
  conversionRate: string
  conversionTrend: string
}) {
  const maxCount = Math.max(...stages.map((s) => s.count))

  return (
    <Card className="bg-[#0a111c]/80 border-white/[0.08]">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base font-semibold">Sales Pipeline</CardTitle>
        <Link href="/deals" className="text-sm text-purple-400 hover:text-purple-300 transition-colors">
          View all
        </Link>
      </CardHeader>
      <CardContent className="space-y-3">
        {stages.map((stage) => {
          const widthPct = Math.max((stage.count / maxCount) * 100, 14)
          return (
            <div
              key={stage.id}
              className="relative rounded-lg h-10 flex items-center overflow-hidden bg-white/[0.03] border border-white/[0.06]"
            >
              <div
                className="absolute inset-y-0 left-0 rounded-lg opacity-25"
                style={{ width: `${widthPct}%`, backgroundColor: stage.color }}
                aria-hidden="true"
              />
              <div className="relative flex w-full items-center justify-between px-3">
                <span className="text-sm font-medium text-white">{stage.name}</span>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-white/70">{stage.count}</span>
                  <span className="text-sm font-semibold text-white">{stage.value}</span>
                </div>
              </div>
            </div>
          )
        })}

        <div className="flex items-center justify-between pt-2 mt-2 border-t border-white/[0.06]">
          <span className="text-sm text-white/60">Conversion Rate</span>
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold text-emerald-400 flex items-center gap-1">
              {conversionRate} <TrendingUp className="h-3.5 w-3.5" />
            </span>
            <span className="text-xs text-white/40">{conversionTrend}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
