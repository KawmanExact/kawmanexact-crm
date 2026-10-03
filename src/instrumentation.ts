/**
 * Runs once when a new Next.js server instance boots, before it handles any
 * request. This exists so assertEnv() validates DATABASE_URL /
 * BETTER_AUTH_SECRET at *startup* — previously it only ran on the first
 * import of src/lib/db.ts, which meant a misconfigured production deploy
 * started fine and then failed opaquely on the first request that touched
 * auth or the database.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { assertEnv } = await import('@/lib/env')
    assertEnv()
  }
}
