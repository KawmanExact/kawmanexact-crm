import { NextResponse } from 'next/server'
import { isAIConfigured } from '@/lib/ai'
import { requireApiSession } from '@/lib/session'
import { checkRateLimit } from '@/lib/rate-limit'
import { generateEmployeeDailySummary, generateTeamManagementSummary } from '@/services/ai.service'

export async function POST(request: Request) {
  if (!isAIConfigured()) {
    return NextResponse.json(
      { error: 'No AI provider configured. Set OPENAI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY.' },
      { status: 503 },
    )
  }

  let session
  try {
    session = await requireApiSession()
  } catch {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const limit = await checkRateLimit(`ai-employee-summary:${session.user.id}`, 10, 60)
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please slow down.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    )
  }

  const body = await request.json().catch(() => ({}))
  const { dailyReportId, from, to } = body as { dailyReportId?: string; from?: string; to?: string }

  try {
    if (dailyReportId) {
      const result = await generateEmployeeDailySummary(dailyReportId)
      if (!result.success) {
        const status = result.error.startsWith('Forbidden') ? 403 : 400
        return NextResponse.json({ error: result.error }, { status })
      }
      return NextResponse.json({ id: result.data.id })
    }
    const dateRange =
      from || to
        ? { from: from ? new Date(from) : new Date(Date.now() - 6 * 86400000), to: to ? new Date(to) : new Date() }
        : undefined
    const result = await generateTeamManagementSummary(dateRange)
    if (!result.success) {
      const status = result.error.startsWith('Forbidden') ? 403 : 400
      return NextResponse.json({ error: result.error }, { status })
    }
    return NextResponse.json({ id: result.data.id })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to generate summary'
    const status = msg.startsWith('Forbidden') ? 403 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
