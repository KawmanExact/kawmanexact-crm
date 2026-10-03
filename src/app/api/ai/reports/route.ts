import { NextResponse } from 'next/server'
import { isAIConfigured } from '@/lib/ai'
import { listReports, generateReport, REPORT_TYPES, type ReportType } from '@/services/ai.service'
import { requireApiSession } from '@/lib/session'
import { checkRateLimit } from '@/lib/rate-limit'

export async function GET() {
  try {
    const reports = await listReports()
    return NextResponse.json(reports)
  } catch {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
}

export async function POST(request: Request) {
  if (!isAIConfigured()) {
    return NextResponse.json(
      { error: 'No AI provider configured. Ask an admin to set OPENAI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY.' },
      { status: 503 }
    )
  }

  let session
  try {
    session = await requireApiSession()
  } catch {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const limit = await checkRateLimit(`ai-reports:${session.user.id}`, 10, 60)
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please slow down.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
    )
  }

  const body = await request.json().catch(() => ({}))
  const { type } = body as { type?: string }

  if (!type || !REPORT_TYPES.some((r) => r.type === type)) {
    return NextResponse.json({ error: 'Invalid report type' }, { status: 400 })
  }

  try {
    const result = await generateReport(type as ReportType)
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }
    return NextResponse.json({ id: result.data.id })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to generate report' }, { status: 500 })
  }
}
