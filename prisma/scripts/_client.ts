/**
 * Prisma client bootstrap for standalone `prisma/scripts/*.ts` run under tsx.
 *
 * WHY THIS EXISTS INSTEAD OF IMPORTING `@/lib/db`:
 * `src/lib/db.ts` imports `src/lib/logger.ts`, which starts with
 * `import 'server-only'`. That marker resolves to a module that THROWS outside a
 * React Server Component bundle, so under plain tsx every script that reaches
 * `@/lib/db` dies with "This module cannot be imported from a Client Component
 * module" before a single query runs. (The pre-existing
 * backfill-contact-email-key.ts and cleanup-phone-number-as-name.ts scripts hit
 * exactly this; changing them is out of scope for the sales work.)
 *
 * This module mirrors src/lib/db.ts's pool + adapter configuration without the
 * server-only import chain, so maintenance scripts are actually runnable.
 * Nothing in the Next.js app imports this file.
 */
import 'dotenv/config'
import { PrismaClient } from '../../src/generated/prisma'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import { assertEnv } from '../../src/lib/env'

assertEnv()

export function createScriptPrismaClient(): PrismaClient {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    // Neon pooled endpoint is pgBouncer — keep the pool small and timeouts
    // tight so maintenance jobs fail fast instead of hanging.
    max: 2,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 120_000,
    query_timeout: 120_000,
  })
  return new PrismaClient({ adapter: new PrismaPg(pool), log: ['error'] })
}
