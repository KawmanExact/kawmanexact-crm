import 'server-only'

/**
 * Input sanitization utilities for AI chat and other user inputs.
 * Prevents prompt injection, limits message length, and redacts PII.
 */

// Maximum message length for AI chat
export const MAX_MESSAGE_LENGTH = 8000 // ~2000 tokens

// Patterns that might indicate prompt injection attempts
const INJECTION_PATTERNS = [
  /ignore\s+previous\s+instructions/i,
  /disregard\s+previous\s+instructions/i,
  /forget\s+previous\s+instructions/i,
  /system\s+prompt/i,
  /you\s+are\s+an?\s+ai/i,
  /as\s+an?\s+ai/i,
  /pretend\s+to\s+be/i,
  /roleplay\s+as/i,
  /act\s+as\s+if/i,
  /simulate\s+being/i,
  /<\|.*?\|>/g, // Special tokens
  /\[INST\][\s\S]*?\[\/INST\]/gi, // Instruction tokens (using [\s\S] instead of . with s flag)
  /<<SYS>>[\s\S]*?<\/SYS>>/gi, // System prompt tokens (using [\s\S] instead of . with s flag)
]

// PII patterns to redact
const PII_PATTERNS = [
  { pattern: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, replacement: '[CREDIT_CARD]' }, // Credit cards
  { pattern: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: '[SSN]' }, // SSN
  { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, replacement: '[EMAIL]' }, // Emails
  { pattern: /\b\d{10}\b/g, replacement: '[PHONE]' }, // Phone numbers (10 digits)
  { pattern: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, replacement: '[PHONE]' }, // US phones
]

export interface SanitizationResult {
  sanitized: string
  wasModified: boolean
  warnings: string[]
}

/**
 * Sanitize user message for AI chat.
 * - Limits length
 * - Detects prompt injection attempts
 * - Redacts PII
 */
export function sanitizeAiMessage(message: string): SanitizationResult {
  const warnings: string[] = []
  let sanitized = message
  let wasModified = false

  // 1. Length limit
  if (sanitized.length > MAX_MESSAGE_LENGTH) {
    sanitized = sanitized.slice(0, MAX_MESSAGE_LENGTH)
    wasModified = true
    warnings.push(`Message truncated to ${MAX_MESSAGE_LENGTH} characters`)
  }

  // 2. Check for prompt injection patterns
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(sanitized)) {
      warnings.push('Potential prompt injection detected')
      // Don't modify - just warn and let the AI handle it
      break
    }
  }

  // 3. Redact PII
  for (const { pattern, replacement } of PII_PATTERNS) {
    const newSanitized = sanitized.replace(pattern, replacement)
    if (newSanitized !== sanitized) {
      sanitized = newSanitized
      wasModified = true
    }
  }

  // 4. Basic HTML/script tag removal (defense in depth)
  const htmlStripped = sanitized.replace(/<[^>]*>/g, '')
  if (htmlStripped !== sanitized) {
    sanitized = htmlStripped
    wasModified = true
    warnings.push('HTML tags removed')
  }

  return { sanitized, wasModified, warnings }
}

/**
 * Sanitize general text input (for other use cases).
 * Less strict than AI message sanitization.
 */
export function sanitizeText(input: string, maxLength = 10000): SanitizationResult {
  const warnings: string[] = []
  let sanitized = input
  let wasModified = false

  if (sanitized.length > maxLength) {
    sanitized = sanitized.slice(0, maxLength)
    wasModified = true
    warnings.push(`Input truncated to ${maxLength} characters`)
  }

  // Remove HTML tags
  const htmlStripped = sanitized.replace(/<[^>]*>/g, '')
  if (htmlStripped !== sanitized) {
    sanitized = htmlStripped
    wasModified = true
    warnings.push('HTML tags removed')
  }

  return { sanitized, wasModified, warnings }
}

/**
 * Validate that input doesn't contain dangerous patterns.
 * Throws if validation fails.
 */
export function validateSafeInput(input: string, fieldName = 'input'): void {
  if (!input || typeof input !== 'string') {
    throw new Error(`${fieldName} must be a non-empty string`)
  }

  // Check for null bytes
  if (input.includes('\0')) {
    throw new Error(`${fieldName} contains null bytes`)
  }

  // Check for excessive length
  if (input.length > 100000) {
    throw new Error(`${fieldName} exceeds maximum allowed length`)
  }
}