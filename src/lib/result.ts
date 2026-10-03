/**
 * Result type for standardized error handling across services, actions, and route handlers.
 * 
 * Usage:
 * - Services: Return Result<T> instead of throwing
 * - Server Actions: Return { error: string } | { success: T } (already standard)
 * - Route Handlers: Use Result<T> internally, convert to NextResponse at boundary
 */

export type Result<T> =
  | { success: true; data: T }
  | { success: false; error: string }

export function ok<T>(data: T): Result<T> {
  return { success: true, data }
}

export function err<T>(error: string): Result<T> {
  return { success: false, error }
}

export function isOk<T>(result: Result<T>): result is { success: true; data: T } {
  return result.success
}

export function isErr<T>(result: Result<T>): result is { success: false; error: string } {
  return !result.success
}

export function unwrap<T>(result: Result<T>): T {
  if (result.success) return result.data
  throw new Error(result.error)
}

export async function tryCatch<T>(
  fn: () => Promise<T>,
  errorMessage?: string
): Promise<Result<T>> {
  try {
    const data = await fn()
    return ok(data)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return err(errorMessage ? `${errorMessage}: ${message}` : message)
  }
}