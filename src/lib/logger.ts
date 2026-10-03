import 'server-only'

/**
 * Lightweight structured logger. Outputs JSON-formatted log lines with
 * timestamp, level, message, and optional context metadata.
 *
 * In production, these lines are consumable by log aggregation tools
 * (Datadog, CloudWatch, etc.). In development, they're pretty-printed
 * for readability.
 *
 * Usage:
 *   import { logger } from '@/lib/logger'
 *   logger.info('User signed in', { userId: user.id })
 *   logger.error('DB query failed', { error: e.message, query: 'findMany' })
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogEntry {
  timestamp: string
  level: LogLevel
  message: string
  context?: Record<string, unknown>
  error?: string
}

const levelPriority: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

const currentLogLevel = (process.env.LOG_LEVEL as LogLevel | undefined) ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug')
const minPriority = levelPriority[currentLogLevel]

function formatLogEntry(entry: LogEntry): string {
  if (process.env.NODE_ENV === 'development') {
    const ctx = entry.context ? ` ${JSON.stringify(entry.context)}` : ''
    const err = entry.error ? `\n  ERROR: ${entry.error}` : ''
    return `[${entry.timestamp}] ${entry.level.toUpperCase().padEnd(5)} ${entry.message}${ctx}${err}`
  }
  return JSON.stringify(entry)
}

function shouldLog(level: LogLevel): boolean {
  return levelPriority[level] >= minPriority
}

function log(level: LogLevel, message: string, context?: Record<string, unknown>, error?: Error): void {
  if (!shouldLog(level)) return

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
  }

  if (context && Object.keys(context).length > 0) {
    entry.context = context
  }

  if (error) {
    entry.error = error instanceof Error ? error.message : String(error)
  }

  console.log(formatLogEntry(entry))
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) => log('debug', message, context),
  info: (message: string, context?: Record<string, unknown>) => log('info', message, context),
  warn: (message: string, context?: Record<string, unknown>) => log('warn', message, context),
  error: (message: string, context?: Record<string, unknown>, error?: Error) => log('error', message, context, error),
}
