'use client'

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, Legend } from 'recharts'

interface ProductivityData {
  date: string
  reportsSubmitted: number
  tasksCompleted: number
  crmRecordsUpdated: number
  leadsWorkedOn: number
  filesUploaded: number
  activeMinutes: number
}

export function TeamProductivityChart({ data }: { data: ProductivityData[] }) {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis dataKey="date" stroke="rgba(255,255,255,0.35)" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v: string) => v.slice(5)} />
          <YAxis stroke="rgba(255,255,255,0.35)" fontSize={11} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{ background: '#0a111c', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
            labelStyle={{ color: '#fff' }}
          />
          <Legend wrapperStyle={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }} />
          <Bar dataKey="reportsSubmitted" name="Reports" fill="#a78bfa" radius={[4, 4, 0, 0]} />
          <Bar dataKey="tasksCompleted" name="Tasks" fill="#34d399" radius={[4, 4, 0, 0]} />
          <Bar dataKey="crmRecordsUpdated" name="CRM" fill="#60a5fa" radius={[4, 4, 0, 0]} />
          <Bar dataKey="activeMinutes" name="Minutes" fill="#fb923c" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
