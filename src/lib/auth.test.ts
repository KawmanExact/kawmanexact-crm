import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getConfiguredProvider, isAIConfigured } from '@/lib/ai'

// Mock environment variables
const originalEnv = process.env

describe('auth configuration', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('getConfiguredProvider', () => {
    it('returns openai when OPENAI_API_KEY is set', () => {
      process.env.OPENAI_API_KEY = 'test-key'
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = undefined
      expect(getConfiguredProvider()).toBe('openai')
    })

    it('returns google when only GOOGLE_GENERATIVE_AI_API_KEY is set', () => {
      process.env.OPENAI_API_KEY = undefined
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'test-key'
      expect(getConfiguredProvider()).toBe('google')
    })

    it('returns openai when both keys are set (openai takes precedence)', () => {
      process.env.OPENAI_API_KEY = 'openai-key'
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'google-key'
      expect(getConfiguredProvider()).toBe('openai')
    })

    it('returns null when no API keys are set', () => {
      process.env.OPENAI_API_KEY = undefined
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = undefined
      expect(getConfiguredProvider()).toBeNull()
    })
  })

  describe('isAIConfigured', () => {
    it('returns true when openai key is set', () => {
      process.env.OPENAI_API_KEY = 'test-key'
      expect(isAIConfigured()).toBe(true)
    })

    it('returns true when google key is set', () => {
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'test-key'
      expect(isAIConfigured()).toBe(true)
    })

    it('returns false when no keys are set', () => {
      process.env.OPENAI_API_KEY = undefined
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = undefined
      expect(isAIConfigured()).toBe(false)
    })
  })
})