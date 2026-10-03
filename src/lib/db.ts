import { PrismaClient } from '../generated/prisma'
import { assertEnv } from './env'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import { logger } from './logger'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  pgPool: pg.Pool | undefined
}
assertEnv()

function getPgPool(): pg.Pool {
  if (globalForPrisma.pgPool) return globalForPrisma.pgPool
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    // Neon pooled endpoint is pgBouncer — keep pool small and timeouts tight
    // so ETIMEDOUTs fail fast instead of hanging the request for 10s+.
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 15_000,
    query_timeout: 15_000,
  })
  pool.on('error', (err) => logger.error('pg pool unexpected error', {}, err))
  if (process.env.NODE_ENV !== 'production') globalForPrisma.pgPool = pool
  return pool
}

const adapter = new PrismaPg(getPgPool())

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

export default prisma
