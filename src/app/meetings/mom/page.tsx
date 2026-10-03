import Link from 'next/link'
import { MainLayout } from '@/components/layout'
import { PageHeader } from '@/components/crm/page-header'
import { Card } from '@/components/ui/card'
import { Sparkles, TrendingUp, TrendingDown, ArrowRight } from 'lucide-react'
import { format } from 'date-fns'
import { getMeetings, getMeetingById } from '@/services/meeting.service'
import { isAIConfigured } from '@/lib/ai'

export const metadata = { title: 'MOM & Insights | Kawman ExAct' }

export default async function MomInsightsPage() {
  const meetings = await getMeetings()
  const withSummary = meetings.filter((m) => m.hasSummary)
  const withoutSummary = meetings.filter((m) => !m.hasSummary)

  // Pull full summaries for the rollup (bounded to keep this page fast).
  const details = await Promise.all(withSummary.slice(0, 20).map((m) => getMeetingById(m.id)))
  const buyingSignals = details.flatMap((d) => (d?.summary ? d.summary.buyingSignals.map((s) => ({ meeting: d.title, signal: s })) : []))
  const riskSignals = details.flatMap((d) => (d?.summary ? d.summary.riskSignals.map((s) => ({ meeting: d.title, signal: s })) : []))

  return (
    <MainLayout>
      <div className="space-y-8">
        <PageHeader title="MOM & Insights" subtitle={`${withSummary.length} of ${meetings.length} meetings have AI-generated minutes`} />

        {!isAIConfigured() && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            AI MoM generation isn&apos;t configured yet. Set <code className="text-amber-100">OPENAI_API_KEY</code> or{' '}
            <code className="text-amber-100">GOOGLE_GENERATIVE_AI_API_KEY</code> to enable it.
          </div>
        )}

        {(buyingSignals.length > 0 || riskSignals.length > 0) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card className="bg-[#0a111c]/80 border-white/[0.08] p-5">
              <p className="text-xs font-semibold text-emerald-300 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5" />
                Recent buying signals
              </p>
              <ul className="space-y-2">
                {buyingSignals.slice(0, 6).map((s, i) => (
                  <li key={i} className="text-sm text-white/70">
                    <span className="text-white/40">{s.meeting}:</span> {s.signal}
                  </li>
                ))}
                {buyingSignals.length === 0 && <li className="text-sm text-white/35">None detected yet</li>}
              </ul>
            </Card>
            <Card className="bg-[#0a111c]/80 border-white/[0.08] p-5">
              <p className="text-xs font-semibold text-red-300 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <TrendingDown className="h-3.5 w-3.5" />
                Recent risk signals
              </p>
              <ul className="space-y-2">
                {riskSignals.slice(0, 6).map((s, i) => (
                  <li key={i} className="text-sm text-white/70">
                    <span className="text-white/40">{s.meeting}:</span> {s.signal}
                  </li>
                ))}
                {riskSignals.length === 0 && <li className="text-sm text-white/35">None detected yet</li>}
              </ul>
            </Card>
          </div>
        )}

        <div>
          <h2 className="text-sm font-semibold text-white/70 mb-3">Meetings with generated MoM</h2>
          {withSummary.length === 0 ? (
            <Card className="bg-[#0a111c]/80 border-white/[0.08] py-12 text-center">
              <Sparkles className="h-6 w-6 text-white/30 mx-auto mb-2" />
              <p className="text-white/40 text-sm">No AI summaries generated yet</p>
            </Card>
          ) : (
            <div className="rounded-xl border border-white/10 bg-white/5 divide-y divide-white/10 overflow-hidden">
              {withSummary.map((m) => (
                <Link
                  key={m.id}
                  href={`/meetings/${m.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-white/5 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-white font-medium truncate">{m.title}</p>
                    <p className="text-xs text-white/40 mt-0.5">
                      {m.companyName ?? 'No company'} · {format(new Date(m.scheduledAt), 'd MMM yyyy')}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-white/30 shrink-0" />
                </Link>
              ))}
            </div>
          )}
        </div>

        {withoutSummary.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-white/70 mb-3">Awaiting MoM generation</h2>
            <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] divide-y divide-white/[0.06] overflow-hidden">
              {withoutSummary.map((m) => (
                <Link
                  key={m.id}
                  href={`/meetings/${m.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-white/5 transition-colors"
                >
                  <p className="text-sm text-white/60 truncate">{m.title}</p>
                  <ArrowRight className="h-4 w-4 text-white/25 shrink-0" />
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  )
}
