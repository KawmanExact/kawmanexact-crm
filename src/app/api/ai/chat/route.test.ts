import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/ai', () => ({
  streamChatCompletion: vi.fn(),
  isAIConfigured: vi.fn(),
}))

vi.mock('@/services/ai.service', () => ({
  prepareChatTurn: vi.fn(),
  saveAssistantReply: vi.fn(),
}))

vi.mock('@/lib/session', () => ({
  requireApiSession: vi.fn(),
}))

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(),
}))

vi.mock('@/lib/sanitize', () => ({
  sanitizeAiMessage: vi.fn(),
  MAX_MESSAGE_LENGTH: 8000,
}))

import { isAIConfigured, streamChatCompletion } from '@/lib/ai'
import { prepareChatTurn, saveAssistantReply } from '@/services/ai.service'
import { requireApiSession } from '@/lib/session'
import { checkRateLimit } from '@/lib/rate-limit'
import { sanitizeAiMessage, MAX_MESSAGE_LENGTH } from '@/lib/sanitize'

const mockIsAIConfigured = vi.mocked(isAIConfigured)
const mockStreamChatCompletion = vi.mocked(streamChatCompletion)
const mockPrepareChatTurn = vi.mocked(prepareChatTurn)
const mockSaveAssistantReply = vi.mocked(saveAssistantReply)
const mockRequireApiSession = vi.mocked(requireApiSession)
const mockCheckRateLimit = vi.mocked(checkRateLimit)
const mockSanitizeAiMessage = vi.mocked(sanitizeAiMessage)

describe('POST /api/ai/chat', () => {
  const mockSession = {
    user: { id: 'user-1', email: 'test@example.com', name: 'Test User' },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockIsAIConfigured.mockReturnValue(true)
    mockRequireApiSession.mockResolvedValue(mockSession)
    mockCheckRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0, remaining: 19 })
    mockSanitizeAiMessage.mockReturnValue({ sanitized: 'Hello', wasModified: false, warnings: [] })
    mockPrepareChatTurn.mockResolvedValue({
      conversationId: 'conv-1',
      messages: [{ role: 'user', content: 'Hello' }],
      system: 'System prompt',
    })
    mockStreamChatCompletion.mockImplementation(async function* () {
      yield 'Hello'
      yield ' world'
    })
    mockSaveAssistantReply.mockResolvedValue(undefined)
  })

  it('returns 503 when AI is not configured', async () => {
    mockIsAIConfigured.mockReturnValue(false)

    const { POST } = await import('@/app/api/ai/chat/route')
    const request = new Request('http://localhost/api/ai/chat', {
      method: 'POST',
      body: JSON.stringify({ message: 'Hello' }),
    })

    const response = await POST(request)
    expect(response.status).toBe(503)
    const data = await response.json()
    expect(data.error).toContain('No AI provider configured')
  })

  it('returns 401 when not authenticated', async () => {
    mockRequireApiSession.mockRejectedValue(new Error('Not authenticated'))

    const { POST } = await import('@/app/api/ai/chat/route')
    const request = new Request('http://localhost/api/ai/chat', {
      method: 'POST',
      body: JSON.stringify({ message: 'Hello' }),
    })

    const response = await POST(request)
    expect(response.status).toBe(401)
    const data = await response.json()
    expect(data.error).toBe('Not authenticated')
  })

  it('returns 429 when rate limited', async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 30, remaining: 0 })

    const { POST } = await import('@/app/api/ai/chat/route')
    const request = new Request('http://localhost/api/ai/chat', {
      method: 'POST',
      body: JSON.stringify({ message: 'Hello' }),
    })

    const response = await POST(request)
    expect(response.status).toBe(429)
    const data = await response.json()
    expect(data.error).toContain('Too many requests')
  })

  it('returns 400 when message is empty after sanitization', async () => {
    // Send a message that passes first check (has content) but gets sanitized to empty
    mockSanitizeAiMessage.mockReturnValue({ sanitized: '', wasModified: true, warnings: [] })

    const { POST } = await import('@/app/api/ai/chat/route')
    const request = new Request('http://localhost/api/ai/chat', {
      method: 'POST',
      body: JSON.stringify({ message: '<script>alert(1)</script>' }), // HTML that gets stripped
    })

    const response = await POST(request)
    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.error).toBe('Message is empty after sanitization')
  })

  it('returns 400 when message exceeds max length', async () => {
    mockSanitizeAiMessage.mockReturnValue({
      sanitized: 'a'.repeat(MAX_MESSAGE_LENGTH + 1),
      wasModified: true,
      warnings: [],
    })

    const { POST } = await import('@/app/api/ai/chat/route')
    const request = new Request('http://localhost/api/ai/chat', {
      method: 'POST',
      body: JSON.stringify({ message: 'a'.repeat(MAX_MESSAGE_LENGTH + 1) }),
    })

    const response = await POST(request)
    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.error).toContain('exceeds maximum length')
  })

  it('streams chat completion on success', async () => {
    const { POST } = await import('@/app/api/ai/chat/route')
    const request = new Request('http://localhost/api/ai/chat', {
      method: 'POST',
      body: JSON.stringify({ message: 'Hello', conversationId: 'conv-1' }),
    })

    const response = await POST(request)
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toContain('text/plain')

    const reader = response.body?.getReader()
    const decoder = new TextDecoder()
    let fullText = ''
    if (reader) {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        fullText += decoder.decode(value)
      }
    }

    expect(fullText).toContain('"type":"meta"')
    expect(fullText).toContain('"type":"delta"')
    expect(fullText).toContain('Hello')
    expect(fullText).toContain('world')
    expect(fullText).toContain('"type":"done"')
  })
})