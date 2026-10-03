import { NextResponse } from 'next/server'
import { requireApiSession } from '@/lib/session'
import { checkRateLimit } from '@/lib/rate-limit'
import { generateCompletion, isAIConfigured, getConfiguredProvider } from '@/lib/ai'
import { recordAIUsage } from '@/services/ai-analytics.service'
import { AI_UPLOAD_MAX_BYTES } from '@/lib/ai-extract'

const SYSTEM_PROMPT = `You are an OCR assistant. Extract contact information from a business card image. Analyze the image carefully and extract the following fields. Output ONLY valid JSON — no markdown fences, no explanatory text. If a field is not visible or cannot be read with confidence, return "-" for that field's value.

{
  "name": "Full name as printed on the card",
  "company": "Company name as printed on the card",
  "designation": "Job title / designation as printed on the card",
  "phone": "Phone number (prefer business line if both provided)",
  "mobile": "Mobile / cell phone number if distinct from phone",
  "email": "Email address",
  "website": "Website URL (strip protocol, e.g. acme.com)",
  "address": "Full postal address if visible"
}`

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: Request) {
  let session
  try {
    session = await requireApiSession()
  } catch {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  if (!isAIConfigured()) {
    return NextResponse.json({ error: 'AI provider is not configured. Set OPENAI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY.' }, { status: 503 })
  }

  const limit = await checkRateLimit(`ocr-scan:${session.user.id}`, 20, 60)
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many scans. Please slow down.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
    )
  }

  const form = await request.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })

  const file = form.get('file')
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided. Send image as `file`.' }, { status: 400 })
  }

  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'File must be an image (PNG, JPG, etc.).' }, { status: 400 })
  }

  if (file.size > AI_UPLOAD_MAX_BYTES) {
    return NextResponse.json({ error: `Image exceeds ${AI_UPLOAD_MAX_BYTES / 1024 / 1024}MB limit.` }, { status: 400 })
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    const base64 = buffer.toString('base64')
    const mimeType = file.type

    const raw = await generateCompletion(
      [{ role: 'user', content: 'Extract contact information from this business card image. Output only JSON.' }],
      SYSTEM_PROMPT,
      {
        images: [{ base64, mimeType }],
      }
    )

    let parsed: Record<string, string>
    try {
      parsed = JSON.parse(extractJson(raw))
    } catch {
      return NextResponse.json({ error: 'AI response could not be parsed. Try again.' }, { status: 502 })
    }

    const result = {
      name: parsed.name ?? '-',
      company: parsed.company ?? '-',
      designation: parsed.designation ?? '-',
      phone: parsed.phone ?? '-',
      mobile: parsed.mobile ?? '-',
      email: parsed.email ?? '-',
      website: parsed.website ?? '-',
      address: parsed.address ?? '-',
    }

    void recordAIUsage({
      organizationId: session.user.organizationId,
      userId: session.user.id,
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      provider: getConfiguredProvider() ?? 'unknown',
      inputTokens: 0,
      outputTokens: raw.length,
      feature: 'business_card_scan',
    }).catch(() => {})

    return NextResponse.json({ contact: result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'OCR scan failed'
    if (message.includes('No AI provider')) {
      return NextResponse.json({ error: message }, { status: 503 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced) return fenced[1].trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start !== -1 && end !== -1 && end > start) return text.slice(start, end + 1)
  return text.trim()
}
