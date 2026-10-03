import { NextResponse } from 'next/server'
import { isAIConfigured } from '@/lib/ai'
import { requireApiSession } from '@/lib/session'
import { checkRateLimit } from '@/lib/rate-limit'
import { generateFieldSalesDailySummary } from '@/services/ai.service'

export async function POST(request: Request) {
  if (!isAIConfigured()) {
    return NextResponse.json(
      { error: 'No AI provider configured. Set OPENAI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY.' },
      { status: 503 }
    )
  }
  let session
  try {
    session = await requireApiSession()
  } catch {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  const limit = await checkRateLimit(`ai-field-daily:${session.user.id}`, 10, 60)
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please slow down.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
    )
  }
  try {
    const body = await request.json().catch(() => ({} as Record<string, unknown>))
    const dateStr = typeof (body as { date?: unknown }).date === 'string' ? (body as { date: string }).date : undefined
    const date = dateStr ? new Date(dateStr) : undefined
    if (date && Number.isNaN(date.getTime())) {
      return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
    }
    const result = await generateFieldSalesDailySummary(date ? { date } : undefined)
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
