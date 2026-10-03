import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Calendar, User, FileText, ShieldCheck } from 'lucide-react'
import { MainLayout } from '@/components/layout'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Markdown } from '@/components/ai/markdown'
import { getReport } from '@/services/ai.service'
import { format } from 'date-fns'
import { ReportActions } from '@/components/ai/report-actions'

export const metadata = { title: 'Report | Kawman ExAct' }

const TYPE_LABEL: Record<string, { label: string; variant: 'default' | 'info' | 'warning' | 'success' }> = {
  PIPELINE_HEALTH: { label: 'Pipeline Health', variant: 'info' },
  WEEKLY_SALES_SUMMARY: { label: 'Weekly Sales', variant: 'success' },
  FOLLOW_UP_RISK: { label: 'Follow-up Risk', variant: 'warning' },
  EXECUTIVE_SUMMARY: { label: 'Executive Summary', variant: 'default' },
  employee_daily_summary: { label: 'Employee Daily Summary', variant: 'info' },
  team_management_summary: { label: 'Team Management', variant: 'default' },
}

export default async function AIReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const report = await getReport(id)
  if (!report) notFound()

  const typeMeta = TYPE_LABEL[report.type] ?? { label: report.type, variant: 'neutral' as const }
  const created = new Date(report.createdAt)

  return (
    <MainLayout>
      <div className="mx-auto max-w-4xl space-y-5 print:max-w-none">
        {/* Top nav */}
        <div className="flex items-center justify-between print:hidden">
          <Button asChild variant="ghost" size="sm" className="gap-1.5 -ml-2 text-white/60 hover:text-white">
            <Link href="/ai/reports">
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to reports
            </Link>
          </Button>
          <ReportActions report={report} />
        </div>

        {/* Document header */}
        <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.06] via-white/[0.03] to-transparent backdrop-blur-xl overflow-hidden print:border-zinc-200 print:bg-white">
          {/* accent top rule */}
          <div className="h-1 w-full bg-gradient-to-r from-violet-600 via-fuchsia-500 to-violet-600 print:from-zinc-900 print:to-zinc-900" />
          <div className="px-6 sm:px-8 pt-6 sm:pt-7 pb-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-violet-500/15 border border-violet-500/25 flex items-center justify-center print:border-zinc-300 print:bg-zinc-100">
                  <FileText className="h-4.5 w-4.5 text-violet-300 print:text-zinc-700" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50 print:text-zinc-500">Kawman ExAct · AI Report</p>
                  <p className="text-xs text-white/35 -mt-0.5 print:text-zinc-500">Grounded in live CRM data · scoped to your permissions</p>
                </div>
              </div>
              <Badge variant={typeMeta.variant as never} className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide print:border-zinc-300">
                {typeMeta.label}
              </Badge>
            </div>

            <h1 className="mt-5 text-[22px] sm:text-[26px] font-bold tracking-tight leading-tight text-white print:text-zinc-900 text-balance">
              {report.title}
            </h1>

            {/* meta strip */}
            <div className="mt-4 flex flex-wrap gap-2.5 text-xs">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-white/60 print:border-zinc-200 print:bg-zinc-50 print:text-zinc-600">
                <Calendar className="h-3.5 w-3.5 opacity-70" />
                {format(created, 'd MMM yyyy · h:mm a')}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-white/60 print:border-zinc-200 print:bg-zinc-50 print:text-zinc-600">
                <User className="h-3.5 w-3.5 opacity-70" />
                {report.generatedByName}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/20 bg-violet-500/10 px-2.5 py-1.5 text-violet-200 print:border-zinc-200 print:bg-zinc-50 print:text-zinc-600">
                <ShieldCheck className="h-3.5 w-3.5" />
                Org-scoped & permission-aware
              </span>
            </div>
          </div>
        </div>

        {/* Document body */}
        <Card className="overflow-hidden border-white/[0.08] bg-[#0a0f1a]/70 print:border-zinc-200 print:bg-white print:shadow-none">
          <CardContent className="px-6 sm:px-8 py-7 sm:py-8">
            {/* subtle report type eyebrow inside card for print */}
            <p className="hidden print:block text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500 mb-3">
              {typeMeta.label} — {format(created, 'd MMM yyyy')}
            </p>
            <Markdown content={report.content} className="text-[14px] leading-relaxed print:text-zinc-800" />
          </CardContent>
          {/* footer strip */}
          <div className="border-t border-white/[0.06] bg-white/[0.02] px-6 sm:px-8 py-3.5 flex flex-wrap items-center justify-between gap-3 text-[11.5px] leading-relaxed text-white/40 print:border-zinc-200 print:bg-zinc-50 print:text-zinc-500">
            <span>Generated {format(created, "d MMM yyyy 'at' h:mm a")} by {report.generatedByName} · Kawman ExAct AI</span>
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 opacity-60" />
              Figures reflect live CRM snapshot at generation time
            </span>
          </div>
        </Card>

        <p className="text-center text-[11px] text-white/25 print:text-zinc-400 px-4">
          This report was generated by AI from your organization’s CRM data and may contain approximations. Verify critical figures before sharing externally.
        </p>
      </div>
    </MainLayout>
  )
}
