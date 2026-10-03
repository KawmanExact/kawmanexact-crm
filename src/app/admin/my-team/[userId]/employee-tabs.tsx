'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, Legend } from 'recharts'
import { Sparkles, Loader2, AlertTriangle } from 'lucide-react'
import type { EmployeeProfileData } from '@/services/daily-report.service'

const TABS = ['Overview', 'Activity Timeline', 'Tasks', 'CRM Work', 'Daily Reports', 'AI Summary', 'Login History', 'Performance Analytics'] as const

export function EmployeeTabs({ profile, aiConfigured, employeeReports }: { profile: EmployeeProfileData; aiConfigured: boolean; employeeReports: { id: string; type: string; title: string; createdAt: string; generatedByName: string }[] }) {
  const [active, setActive] = useState<typeof TABS[number]>('Overview')
  const [genId, setGenId] = useState<string | null>(null)
  const [genErr, setGenErr] = useState<string | null>(null)
  const router = useRouter()

  async function generateForReport(dailyReportId: string) {
    setGenId(dailyReportId)
    setGenErr(null)
    try {
      const res = await fetch('/api/ai/employee-summary', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dailyReportId }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      router.push(`/ai/reports/${data.id}`)
    } catch (e) {
      setGenErr(e instanceof Error ? e.message : 'Failed')
    } finally {
      setGenId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 border-b border-white/[0.08] pb-3">
        {TABS.map((t) => (
          <button key={t} onClick={() => setActive(t)} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${active === t ? 'bg-purple-600 text-white' : 'text-white/60 hover:text-white hover:bg-white/5'}`}>{t}</button>
        ))}
      </div>

      {active === 'Overview' && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Kpi label="Total reports" value={profile.overview.totalReports} />
          <Kpi label="Submitted" value={profile.overview.submittedReports} />
          <Kpi label="Missed" value={profile.overview.missedReports} />
          <Kpi label="Avg CRM updates" value={profile.overview.avgCrmRecordsUpdated} />
          <Kpi label="Avg tasks" value={profile.overview.avgTasksCompleted} />
          <Kpi label="Avg leads" value={profile.overview.avgLeadsWorkedOn} />
          <Kpi label="Avg files" value={profile.overview.avgFilesUploaded} />
          <Kpi label="Avg active min" value={profile.overview.avgActiveMinutes} />
        </div>
      )}

      {active === 'Activity Timeline' && (
        <Card className="p-5 bg-[#0a111c]/80 border-white/[0.08]">
          {profile.activityTimeline.length === 0 ? <p className="text-sm text-white/40">No activity in this range.</p> : (
            <div className="space-y-3">
              {profile.activityTimeline.map((a) => (
                <div key={a.id} className="flex gap-3 text-sm border-b border-white/[0.06] pb-3 last:border-0 last:pb-0">
                  <Badge variant="neutral">{a.type}</Badge>
                  <div className="min-w-0 flex-1">
                    <p className="text-white/80">{a.description}</p>
                    <p className="text-xs text-white/40">{new Date(a.createdAt).toLocaleString('en-IN')}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {active === 'Tasks' && (
        <Card className="p-5 bg-[#0a111c]/80 border-white/[0.08]">
          <p className="text-sm text-white/60">Tasks are tracked as Follow-ups for this org (see Follow-ups). Completed follow-ups feed the daily report&apos;s tasks completed count.</p>
          <Link href="/follow-ups"><Button size="sm" variant="outline" className="mt-3">Open Follow-ups</Button></Link>
        </Card>
      )}

      {active === 'CRM Work' && (
        <Card className="p-5 bg-[#0a111c]/80 border-white/[0.08]">
          <p className="text-sm text-white/60">CRM work is reported via daily reports and the activity timeline. See those tabs for this employee&apos;s recent CRM activity.</p>
        </Card>
      )}

      {active === 'Daily Reports' && (
        <Card className="p-5 bg-[#0a111c]/80 border-white/[0.08]">
          {profile.recentReports.length === 0 ? <p className="text-sm text-white/40">No reports for this employee.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-white/40 text-xs uppercase tracking-wide border-b border-white/[0.06]">
                  <tr><th className="py-2 font-medium">Date</th><th className="py-2 font-medium">Status</th><th className="py-2 font-medium">Tasks</th><th className="py-2 font-medium">CRM</th><th className="py-2 font-medium">Minutes</th><th className="py-2 font-medium">Visit Reports</th><th className="py-2 font-medium">AI</th></tr>
                </thead>
                <tbody>
                  {profile.recentReports.map((r) => (
                    <tr key={r.id} className="border-b border-white/[0.04]">
                      <td className="py-2 text-white/80">{new Date(r.date).toLocaleDateString('en-IN')}</td>
                      <td className="py-2"><Badge variant={r.status === 'SUBMITTED' ? 'success' : r.status === 'DRAFT' ? 'warning' : 'danger'}>{r.status}</Badge></td>
                      <td className="py-2 text-white/60">{r.tasksCompletedCount}</td>
                      <td className="py-2 text-white/60">{r.crmRecordsUpdatedCount}</td>
                      <td className="py-2 text-white/60">{r.activeWorkingTimeMinutes}</td>
                      <td className="py-2 text-white/60">{r.visitReportsCount}</td>
                      <td className="py-2">
                        <Button size="sm" variant="outline" disabled={!aiConfigured || genId !== null} onClick={() => generateForReport(r.id)}>
                          {genId === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} Generate
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {genErr && <p className="text-xs text-red-400 mt-2 flex items-center gap-1"><AlertTriangle className="h-3 w-3" />{genErr}</p>}
            </div>
          )}
        </Card>
      )}

      {active === 'AI Summary' && (
        <Card className="p-5 bg-[#0a111c]/80 border-white/[0.08]">
          {!aiConfigured && <div className="flex items-center gap-2 text-sm text-amber-200 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 mb-3"><AlertTriangle className="h-4 w-4" /> Configure OPENAI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY to use AI summaries.</div>}
          {employeeReports.length === 0 ? <p className="text-sm text-white/40">No AI summaries for this employee yet. Generate one from Daily Reports.</p> : (
            <div className="divide-y divide-white/10 rounded-xl border border-white/10 bg-white/5 overflow-hidden">
              {employeeReports.map((r) => (
                <Link key={r.id} href={`/ai/reports/${r.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-white/5 transition-colors">
                  <div><p className="text-sm text-white font-medium">{r.title}</p><p className="text-xs text-white/40">{r.generatedByName}</p></div>
                </Link>
              ))}
            </div>
          )}
        </Card>
      )}

      {active === 'Login History' && (
        <Card className="p-5 bg-[#0a111c]/80 border-white/[0.08]">
          {profile.loginHistory.length === 0 ? <p className="text-sm text-white/40">No sessions in this range.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-white/40 text-xs uppercase tracking-wide border-b border-white/[0.06]">
                  <tr><th className="py-2 font-medium">Created</th><th className="py-2 font-medium">Ended</th><th className="py-2 font-medium">IP</th><th className="py-2 font-medium">Agent</th></tr>
                </thead>
                <tbody>
                  {profile.loginHistory.map((s) => (
                    <tr key={s.id} className="border-b border-white/[0.04]">
                      <td className="py-2 text-white/70">{new Date(s.createdAt).toLocaleString('en-IN')}</td>
                      <td className="py-2 text-white/40">{s.endedAt ? new Date(s.endedAt).toLocaleString('en-IN') : '—'}</td>
                      <td className="py-2 text-white/40">{s.ipAddress ?? '—'}</td>
                      <td className="py-2 text-white/40 truncate max-w-[240px]">{s.userAgent ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {active === 'Performance Analytics' && (
        <Card className="p-5 bg-[#0a111c]/80 border-white/[0.08]">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={profile.performanceAnalytics} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="date" stroke="rgba(255,255,255,0.35)" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v: string) => v.slice(5)} />
                <YAxis stroke="rgba(255,255,255,0.35)" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: '#0a111c', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} labelStyle={{ color: '#fff' }} />
                <Legend wrapperStyle={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }} />
                <Bar dataKey="tasksCompleted" name="Tasks" fill="#a78bfa" radius={[4,4,0,0]} />
                <Bar dataKey="crmRecordsUpdated" name="CRM" fill="#60a5fa" radius={[4,4,0,0]} />
                <Bar dataKey="activeMinutes" name="Minutes" fill="#fb923c" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}
    </div>
  )
}

function Kpi({ label, value }: { label: string; value: number | string }) {
  return <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4"><p className="text-xs text-white/40">{label}</p><p className="text-xl font-bold text-white mt-1">{value}</p></div>
}
