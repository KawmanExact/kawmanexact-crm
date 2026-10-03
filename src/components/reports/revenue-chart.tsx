'use client'

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, Legend } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface RevenuePoint {
  month: string
  won: number
  lost: number
}

export function RevenueChart({ data }: { data: RevenuePoint[] }) {
  return (
    <Card className="bg-[#0a111c]/80 border-white/[0.08]">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">Won vs Lost Revenue</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="month" stroke="rgba(255,255,255,0.35)" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis
                stroke="rgba(255,255,255,0.35)"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => (v >= 1000 ? `₹${Math.round(v / 1000)}k` : `₹${v}`)}
              />
              <Tooltip
                contentStyle={{ background: '#0a111c', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                labelStyle={{ color: '#fff' }}
                formatter={(v) => `₹${Number(v).toLocaleString('en-IN')}`}
              />
              <Legend wrapperStyle={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }} />
              <Bar dataKey="won" name="Won" fill="#22c55e" radius={[4, 4, 0, 0]} />
              <Bar dataKey="lost" name="Lost" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
