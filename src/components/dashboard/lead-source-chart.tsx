'use client'

import * as React from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Info } from 'lucide-react'
import type { LeadSource } from '@/types/dashboard'

const DONUT_SIZE = 176

function pctLabel(pct: number): string {
  return pct > 0 ? `${pct}%` : '<1%'
}

export function LeadSourceChart({ sources, total }: { sources: LeadSource[]; total: number }) {
  const [openId, setOpenId] = React.useState<string | null>(null)

  return (
    <Card className="bg-[#0a111c]/80 border-white/[0.08]">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base font-semibold">Leads by Source</CardTitle>
        <span className="text-xs text-white/40">All time</span>
      </CardHeader>

      <CardContent>
        {sources.length === 0 ? (
          <div className="py-8 text-center text-white/50">No lead sources recorded yet.</div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            {/* Donut, centered */}
            <div
              className="relative mx-auto"
              style={{ width: DONUT_SIZE, height: DONUT_SIZE }}
              role="img"
              aria-label={`Leads by source, total ${total}`}
            >
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={sources}
                    dataKey="count"
                    nameKey="name"
                    innerRadius={60}
                    outerRadius={80}
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

            {/* Legend, full width, below the donut */}
            <div className="w-full space-y-2">
              {sources.map((source) => {
                const isOther =
                  source.color === '#6b7280' && typeof source.foldedSources !== 'undefined'
                const longName = source.name.length > 24
                return (
                  <div key={source.id} className="flex items-center justify-between gap-3 text-sm">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: source.color }}
                        aria-hidden={isOther}
                      />
                      <span
                        className="text-white/75 truncate"
                        title={longName ? source.name : undefined}
                      >
                        {source.name}
                      </span>
                      {isOther && source.foldedSources && (
                        <Popover
                          open={openId === source.id}
                          onOpenChange={(open) => setOpenId(open ? source.id : null)}
                        >
                          <PopoverTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5 shrink-0 rounded-full text-white/40 hover:text-white/80 focus:ring-1 focus:ring-white/30"
                              aria-label={openId === source.id ? 'Close folded sources' : 'Show folded sources'}
                              aria-expanded={openId === source.id}
                              aria-controls={openId === source.id ? 'folded-sources-list' : undefined}
                            >
                              <Info className="h-3.5 w-3.5" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent
                            side="top"
                            align="start"
                            className="z-50 w-64 max-w-[min(100vw-2rem,24rem)] border-white/[0.12] bg-[#0a111c] p-3 text-white shadow-xl"
                          >
                            <div className="space-y-1">
                              <div className="text-xs font-medium text-white/60">
                                Folded sources ({source.foldedSources.length})
                              </div>
                              <div
                                id="folded-sources-list"
                                className="max-h-64 overflow-y-auto"
                              >
                                {source.foldedSources.map((f) => (
                                  <div
                                    key={f.name}
                                    className="flex items-center justify-between gap-2 text-sm"
                                  >
                                    <span
                                      className="truncate text-white/70"
                                      title={f.name}
                                    >
                                      {f.name}
                                    </span>
                                    <span className="font-mono text-white/60 shrink-0">
                                      {f.count.toLocaleString()}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </PopoverContent>
                        </Popover>
                      )}
                    </div>
                    <span className="text-white/60 whitespace-nowrap ml-3 shrink-0 font-mono tabular-nums">
                      {source.count.toLocaleString()} ({pctLabel(source.percentage)})
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
