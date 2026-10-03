'use client'

import * as React from 'react'
import {
  ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  LineChart, Line,
  PieChart, Pie, Cell, Legend,
} from 'recharts'

export type AIChartSpec = {
  title: string
  type: 'bar' | 'line' | 'pie'
  xKey: string
  yKeys: string[]
  data: Record<string, unknown>[]
}

const PALETTE = ['#7c3aed', '#06b6d4', '#f59e0b', '#10b981', '#ef4444', '#6366f1']

export function AiCharts({ charts }: { charts: AIChartSpec[] }) {
  if (!charts?.length) return null
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {charts.map((c, idx) => (
        <div key={`${c.title}-${idx}`} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <div className="text-xs font-medium text-white/70 mb-2 truncate">{c.title}</div>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              {c.type === 'bar' ? (
                <BarChart data={c.data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" />
                  <XAxis dataKey={c.xKey} tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 11 }} tickLine={false} axisLine={false} interval={0} angle={-14} textAnchor="end" height={48} />
                  <YAxis tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 11 }} tickLine={false} axisLine={false} width={56} />
                  <Tooltip
                    contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, color: '#fff' }}
                    labelStyle={{ color: 'rgba(255,255,255,0.6)' }}
                  />
                  {c.yKeys.map((k, i) => (
                    <Bar key={k} dataKey={k} fill={PALETTE[i % PALETTE.length]} radius={[6, 6, 0, 0]} />
                  ))}
                </BarChart>
              ) : c.type === 'line' ? (
                <LineChart data={c.data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" />
                  <XAxis dataKey={c.xKey} tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 11 }} tickLine={false} axisLine={false} interval={0} angle={-14} textAnchor="end" height={48} />
                  <YAxis tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 11 }} tickLine={false} axisLine={false} width={56} />
                  <Tooltip
                    contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, color: '#fff' }}
                    labelStyle={{ color: 'rgba(255,255,255,0.6)' }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }} />
                  {c.yKeys.map((k, i) => (
                    <Line key={k} type="monotone" dataKey={k} stroke={PALETTE[i % PALETTE.length]} strokeWidth={2} dot={false} />
                  ))}
                </LineChart>
              ) : (
                <PieChart>
                  <Tooltip
                    contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, color: '#fff' }}
                  />
                  <Pie
                    data={c.data}
                    dataKey={c.yKeys[0]}
                    nameKey={c.xKey}
                    cx="50%"
                    cy="50%"
                    outerRadius={72}
                    label={({ name, percent }) => `${String(name).slice(0, 10)} ${((percent ?? 0) * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {c.data.map((_, i) => (
                      <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                    ))}
                  </Pie>
                  <Legend wrapperStyle={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }} />
                </PieChart>
              )}
            </ResponsiveContainer>
          </div>
          <div className="mt-1 text-[10px] text-white/25">{c.xKey} → {c.yKeys.join(', ')}</div>
        </div>
      ))}
    </div>
  )
}
