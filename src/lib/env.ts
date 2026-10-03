// Intentionally no `import 'server-only'` here — this module is imported
// from prisma/seed.ts via `tsx` outside the Next.js build, where the
// `server-only` package's `react-server` export isn't resolved and the
// default entry throws. All callers are server-side regardless (db.ts,
// instrumentation.ts, seed); see rbac-seed.ts for the same note.
/**
 * Validates required env vars at startup.
 * Call `assertEnv()` in instrumentation.ts so production crashes fast
 * with a clear message instead of failing opaquely on first DB/auth call.
 *
 * In development, also warns about missing optional integrations (AI,
 * Cloudinary, Redis) so developers know which features won't work.
 */
const REQUIRED_IN_PRODUCTION = ['DATABASE_URL', 'BETTER_AUTH_SECRET'] as const

const OPTIONAL_DEV_WARNINGS: Record<string, string> = {
  OPENAI_API_KEY: 'AI chat/completions will fail without an AI provider key',
  GOOGLE_GENERATIVE_AI_API_KEY: 'AI chat/completions will fail without an AI provider key',
  CLOUDINARY_CLOUD_NAME: 'File uploads will fail without Cloudinary credentials',
  REDIS_URL: 'Background jobs (BullMQ queue) and rate-limiting cache will fall back to in-memory',
  SMTP_HOST: 'Transactional emails (password reset, invites) will log to console instead of being sent via SMTP',
}

export function assertEnv(): void {
  const missing: string[] = []
  const isProd = process.env.NODE_ENV === 'production'
  for (const key of REQUIRED_IN_PRODUCTION) {
    if (!process.env[key]) missing.push(key)
  }
  if (missing.length > 0) {
    const msg = `[env] Missing required environment variables: ${missing.join(', ')}`
    if (isProd) throw new Error(msg)
    console.warn(`${msg} — continuing in development, but auth/DB will fail without them.`)
  }
  // BETTER_AUTH_SECRET should be at least 32 chars
  const secret = process.env.BETTER_AUTH_SECRET
  if (secret && secret.length < 32) {
    console.warn('[env] BETTER_AUTH_SECRET is too short (< 32 chars) — use `openssl rand -hex 32`.')
  }

  // In development, warn about missing optional integrations so devs know
  // which features are disabled. These are NOT required — the code degrades
  // gracefully (AI returns an error, uploads are local-only, etc.).
  if (!isProd) {
    for (const [key, description] of Object.entries(OPTIONAL_DEV_WARNINGS)) {
      if (!process.env[key]) {
        console.warn(`[env] Optional var ${key} is not set — ${description}.`)
      }
    }
  }
}
