import { describe, it, expect } from 'vitest'
import { sanitizeAiMessage, sanitizeText, validateSafeInput, MAX_MESSAGE_LENGTH } from '@/lib/sanitize'

describe('sanitize', () => {
  describe('sanitizeAiMessage', () => {
    it('returns original message when under length limit and no issues', () => {
      const result = sanitizeAiMessage('Hello, how are you?')
      expect(result.sanitized).toBe('Hello, how are you?')
      expect(result.wasModified).toBe(false)
      expect(result.warnings).toEqual([])
    })

    it('truncates message exceeding MAX_MESSAGE_LENGTH', () => {
      const longMessage = 'a'.repeat(MAX_MESSAGE_LENGTH + 100)
      const result = sanitizeAiMessage(longMessage)
      expect(result.sanitized.length).toBe(MAX_MESSAGE_LENGTH)
      expect(result.wasModified).toBe(true)
      expect(result.warnings).toContain(`Message truncated to ${MAX_MESSAGE_LENGTH} characters`)
    })

    it('detects prompt injection patterns', () => {
      const injectionAttempts = [
        'Ignore previous instructions',
        'Disregard previous instructions',
        'Forget previous instructions',
        'System prompt',
        'You are an AI',
        'As an AI',
        'Pretend to be',
        'Roleplay as',
        'Act as if',
        'Simulate being',
        '<|special|>',
        '[INST]instruction[/INST]',
        '<<SYS>>system<</SYS>>',
      ]

      for (const attempt of injectionAttempts) {
        const result = sanitizeAiMessage(attempt)
        expect(result.warnings).toContain('Potential prompt injection detected')
      }
    })

    it('redacts credit card numbers', () => {
      const result = sanitizeAiMessage('My card is 1234-5678-9012-3456')
      expect(result.sanitized).toContain('[CREDIT_CARD]')
      expect(result.wasModified).toBe(true)
    })

    it('redacts SSN', () => {
      const result = sanitizeAiMessage('My SSN is 123-45-6789')
      expect(result.sanitized).toContain('[SSN]')
      expect(result.wasModified).toBe(true)
    })

    it('redacts email addresses', () => {
      const result = sanitizeAiMessage('Contact me at test@example.com')
      expect(result.sanitized).toContain('[EMAIL]')
      expect(result.wasModified).toBe(true)
    })

    it('redacts phone numbers', () => {
      const result = sanitizeAiMessage('Call me at 1234567890')
      expect(result.sanitized).toContain('[PHONE]')
      expect(result.wasModified).toBe(true)
    })

    it('redacts US phone numbers with formatting', () => {
      const result = sanitizeAiMessage('Call me at (123) 456-7890')
      expect(result.sanitized).toContain('[PHONE]')
      expect(result.wasModified).toBe(true)
    })

    it('removes HTML tags', () => {
      const result = sanitizeAiMessage('<script>alert(1)</script>Hello')
      expect(result.sanitized).toBe('alert(1)Hello')
      expect(result.wasModified).toBe(true)
      expect(result.warnings).toContain('HTML tags removed')
    })

    it('handles multiple issues in one message', () => {
      const result = sanitizeAiMessage('<b>Email me at test@example.com</b>')
      expect(result.sanitized).toBe('Email me at [EMAIL]')
      expect(result.wasModified).toBe(true)
      expect(result.warnings).toContain('HTML tags removed')
    })
  })

  describe('sanitizeText', () => {
    it('returns original text when under limit', () => {
      const result = sanitizeText('Simple text')
      expect(result.sanitized).toBe('Simple text')
      expect(result.wasModified).toBe(false)
    })

    it('truncates text exceeding maxLength', () => {
      const result = sanitizeText('a'.repeat(15000), 10000)
      expect(result.sanitized.length).toBe(10000)
      expect(result.wasModified).toBe(true)
      expect(result.warnings).toContain('Input truncated to 10000 characters')
    })

    it('removes HTML tags', () => {
      const result = sanitizeText('<p>Hello</p>')
      expect(result.sanitized).toBe('Hello')
      expect(result.wasModified).toBe(true)
      expect(result.warnings).toContain('HTML tags removed')
    })

    it('uses default maxLength of 10000', () => {
      const result = sanitizeText('a'.repeat(15000))
      expect(result.sanitized.length).toBe(10000)
    })
  })

  describe('validateSafeInput', () => {
    it('passes for valid input', () => {
      expect(() => validateSafeInput('valid input', 'field')).not.toThrow()
    })

    it('throws for empty string', () => {
      expect(() => validateSafeInput('', 'field')).toThrow('field must be a non-empty string')
    })

    it('throws for null', () => {
      expect(() => validateSafeInput(null as any, 'field')).toThrow('field must be a non-empty string')
    })

    it('throws for undefined', () => {
      expect(() => validateSafeInput(undefined as any, 'field')).toThrow('field must be a non-empty string')
    })

    it('throws for null bytes', () => {
      expect(() => validateSafeInput('test\0input', 'field')).toThrow('field contains null bytes')
    })

    it('throws for excessive length', () => {
      expect(() => validateSafeInput('a'.repeat(100001), 'field')).toThrow('field exceeds maximum allowed length')
    })
  })
})