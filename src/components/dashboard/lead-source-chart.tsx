'use client'

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { LeadSource } from '@/types/dashboard'

export function LeadSourceChart({ sources, total }: { sources: LeadSource[]; total: number }) {
  return (
    <Card className="bg-[#0a111c]/80 border-white/[0.08]">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base font-semibold">Leads by Source</CardTitle>
        <span className="text-xs text-white/40">This Month</span>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] items-center gap-4">
          <div className="relative h-40 w-40 mx-auto">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={sources}
                  dataKey="count"
                  nameKey="name"
                  innerRadius={52}
                  outerRadius={72}
                  paddingAngle={2}
                  stroke="none"
                >
                  {sources.map((source) => (
                    <Cell key={source.id} fill={source.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: '#0d1622',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 8,
                    fontSize: 12,
                    color: '#fff',
                  }}
                  formatter={(value, name) => [`${value} leads`, name]}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-2xl font-bold text-white">{total}</span>
              <span className="text-[11px] text-white/45">Total Leads</span>
            </div>
          </div>

          <div className="space-y-2.5">
            {sources.map((source) => (
              <div key={source.id} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: source.color }} />
                  <span className="text-white/75 truncate">{source.name}</span>
                </div>
                <span className="text-white/60 whitespace-nowrap ml-3">
                  {source.count} ({source.percentage}%)
                </span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
