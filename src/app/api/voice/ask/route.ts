import { NextResponse } from 'next/server'
import { isAIConfigured } from '@/lib/ai'
import { requireApiSession } from '@/lib/session'
import { checkRateLimit } from '@/lib/rate-limit'
import { transcribeAudio, generateSpeech } from 'samai-sdk'
import { runVoiceAgent } from '@/services/voice-agent'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'

const MAX_AUDIO_BYTES = 2 * 1024 * 1024

export async function POST(request: Request) {
  if (!isAIConfigured()) {
    return NextResponse.json(
      { error: 'AI not configured. Set OPENAI_API_KEY.' },
      { status: 503 },
    )
  }

  let session
  try {
    session = await requireApiSession()
  } catch {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const limit = await checkRateLimit(`voice-ask:${session.user.id}`, 10, 60)
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please slow down.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    )
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const audioField = formData.get('audio')
  if (!audioField || typeof audioField === 'string' || !(audioField instanceof Blob)) {
    return NextResponse.json({ error: 'audio file is required (multipart "audio")' }, { status: 400 })
  }

  const audioBuffer = Buffer.from(await audioField.arrayBuffer())
  if (audioBuffer.length === 0) {
    return NextResponse.json({ error: 'audio file is empty' }, { status: 400 })
  }
  if (audioBuffer.length > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: `audio too large (max ${MAX_AUDIO_BYTES} bytes)` }, { status: 413 })
  }

  try {
    const { text: transcript } = await transcribeAudio({
      audio: audioBuffer,
      filename: 'recording.wav',
      apiKey: process.env.OPENAI_API_KEY,
    })

    if (!transcript || !transcript.trim()) {
      return NextResponse.json({ error: 'No speech detected in recording' }, { status: 200 })
    }

    const { answerText } = await runVoiceAgent(transcript)

    if (!answerText || !answerText.trim()) {
      return NextResponse.json({ transcript, answerText: '' }, { status: 200 })
    }

    const { audio, contentType } = await generateSpeech({
      input: answerText,
      apiKey: process.env.OPENAI_API_KEY,
    })

    const audioBase64 = audio.toString('base64')

    return NextResponse.json({
      transcript,
      answerText,
      audioBase64,
      contentType,
    })
  } catch (err) {
    logger.error('voice ask failed', { userId: session.user.id }, err as Error)
    return NextResponse.json({ error: 'Voice processing failed. Please try again.' }, { status: 500 })
  }
}
