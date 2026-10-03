import 'server-only'

export type AIRole = 'system' | 'user' | 'assistant'
export interface AIChatMessage {
  role: AIRole
  content: string
}
export interface AIImageAttachment {
  base64: string
  mimeType: string
}
export type AIProviderName = 'openai' | 'google'

/**
 * Which provider is configured, if any. Code checks OPENAI_API_KEY first,
 * then falls back to GOOGLE_GENERATIVE_AI_API_KEY (matches .env.example).
 */
export function getConfiguredProvider(): AIProviderName | null {
  if (process.env.OPENAI_API_KEY) return 'openai'
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) return 'google'
  return null
}

export function isAIConfigured(): boolean {
  return getConfiguredProvider() !== null
}

const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini'
const GOOGLE_MODEL = process.env.GOOGLE_GENERATIVE_AI_MODEL || 'gemini-2.0-flash'

type StreamOpts = {
  images?: AIImageAttachment[]
  /** Extra document text to append to the system prompt (PDF/sheet extracts). */
  docContext?: string
}

function withDocContext(system: string | undefined, docContext?: string): string | undefined {
  if (!docContext?.trim()) return system
  const block = `\n\n=== Uploaded Document Context (treat as user-provided source) ===\n${docContext}\n=== End Document Context ===`
  return system ? system + block : docContext
}

/**
 * Streams a chat completion as an async generator of text deltas.
 * Provider-agnostic: works with whichever of OpenAI / Google is configured.
 * Supports image attachments (vision) and extra document context.
 * Throws if no provider is configured — callers should check
 * `isAIConfigured()` first and show a friendly empty state instead.
 */
export async function* streamChatCompletion(
  messages: AIChatMessage[],
  system?: string,
  opts?: StreamOpts
): AsyncGenerator<string> {
  const provider = getConfiguredProvider()
  if (!provider) {
    throw new Error(
      'No AI provider configured. Set OPENAI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY in your environment.'
    )
  }
  const sys = withDocContext(system, opts?.docContext)
  const images = opts?.images ?? []

  if (provider === 'openai') {
    const { default: OpenAI } = await import('openai')
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })
    // OpenAI expects last user message as multimodal when images present
    const openaiMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> }> = []
    if (sys) openaiMessages.push({ role: 'system', content: sys })
    for (let idx = 0; idx < messages.length; idx++) {
      const m = messages[idx]
      const isLast = idx === messages.length - 1
      if (isLast && m.role === 'user' && images.length) {
        const parts: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> = [
          { type: 'text', text: m.content },
        ]
        for (const img of images) {
          parts.push({ type: 'image_url', image_url: { url: `data:${img.mimeType};base64,${img.base64}` } })
        }
        openaiMessages.push({ role: 'user', content: parts })
      } else {
        openaiMessages.push({ role: m.role as 'user' | 'assistant' | 'system', content: m.content })
      }
    }
    const stream = await client.chat.completions.create({
      model: OPENAI_MODEL,
      stream: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: openaiMessages as any,
    })
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content
      if (delta) yield delta
    }
    return
  }

  // Google Gemini
  const { GoogleGenerativeAI } = await import('@google/generative-ai')
  const client = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY!)
  const model = client.getGenerativeModel({ model: GOOGLE_MODEL, systemInstruction: sys })

  const history = messages.slice(0, -1).map((m) => ({
    role: m.role === 'assistant' ? ('model' as const) : ('user' as const),
    parts: [{ text: m.content }],
  }))
  const last = messages[messages.length - 1]
  if (images.length && last?.role === 'user') {
    const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [{ text: last.content }]
    for (const img of images) parts.push({ inlineData: { mimeType: img.mimeType, data: img.base64 } })
    const chat = model.startChat({ history })
    const result = await chat.sendMessageStream(parts as unknown as string)
    for await (const chunk of result.stream) {
      const text = chunk.text()
      if (text) yield text
    }
    return
  }

  const chat = model.startChat({ history })
  const result = await chat.sendMessageStream(last?.content ?? '')
  for await (const chunk of result.stream) {
    const text = chunk.text()
    if (text) yield text
  }
}

/**
 * One-shot (non-streaming) completion — used for report generation where
 * we want the full text before persisting it.
 */
export async function generateCompletion(
  messages: AIChatMessage[],
  system?: string,
  opts?: StreamOpts
): Promise<string> {
  let full = ''
  for await (const delta of streamChatCompletion(messages, system, opts)) {
    full += delta
  }
  return full
}
