// Global test setup - minimal mocks for server-only modules
import { vi } from 'vitest'

// Mock server-only to be a no-op
vi.mock('server-only', () => ({}))

// Mock next/headers
vi.mock('next/headers', () => ({
  headers: vi.fn(() => new Headers()),
  cookies: vi.fn(() => ({ get: vi.fn(), set: vi.fn(), delete: vi.fn() })),
}))

// Mock next/navigation
vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  notFound: vi.fn(),
}))

// Mock better-auth
vi.mock('better-auth', () => ({
  betterAuth: vi.fn(() => ({
    api: { getSession: vi.fn() },
    $Infer: { Session: {} as any },
  })),
}))

// Mock better-auth/adapters/prisma
vi.mock('better-auth/adapters/prisma', () => ({
  prismaAdapter: vi.fn(() => ({})),
}))

// Mock better-auth/next-js
vi.mock('better-auth/next-js', () => ({
  nextCookies: vi.fn(() => ({})),
}))

// Mock better-auth/plugins/custom-session
vi.mock('better-auth/plugins/custom-session', () => ({
  customSession: vi.fn(() => ({})),
}))

// Mock @prisma/client
vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(() => ({
    user: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    session: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    dailyReport: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn(), upsert: vi.fn() },
    userRole: { findMany: vi.fn() },
    role: { findMany: vi.fn() },
    lead: { groupBy: vi.fn(), findMany: vi.fn() },
    deal: { groupBy: vi.fn(), aggregate: vi.fn(), findMany: vi.fn() },
    followUp: { count: vi.fn() },
    fieldVisit: { findMany: vi.fn() },
    activity: { findMany: vi.fn(), create: vi.fn(), count: vi.fn() },
    aIReport: { create: vi.fn(), findFirst: vi.fn(), delete: vi.fn() },
    file: { count: vi.fn() },
    department: { findMany: vi.fn() },
    team: { findMany: vi.fn() },
  })),
  Prisma: {},
}))

// Mock @/lib/db - minimal mock, tests should provide their own
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    session: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    dailyReport: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn(), upsert: vi.fn() },
    userRole: { findMany: vi.fn() },
    role: { findMany: vi.fn() },
    lead: { groupBy: vi.fn(), findMany: vi.fn() },
    deal: { groupBy: vi.fn(), aggregate: vi.fn(), findMany: vi.fn() },
    followUp: { count: vi.fn() },
    fieldVisit: { findMany: vi.fn() },
    activity: { findMany: vi.fn(), create: vi.fn(), count: vi.fn() },
    aIReport: { create: vi.fn(), findFirst: vi.fn(), delete: vi.fn() },
    file: { count: vi.fn() },
    department: { findMany: vi.fn() },
    team: { findMany: vi.fn() },
  },
}))

// Mock @/lib/auth
vi.mock('@/lib/auth', () => ({
  auth: {
    api: { getSession: vi.fn() },
    $Infer: { Session: {} as any },
  },
}))

// Mock @/lib/cloudinary
vi.mock('@/lib/cloudinary', () => ({
  isCloudinaryConfigured: vi.fn(),
  uploadToCloudinary: vi.fn(),
}))

// Mock @/services/file.service
vi.mock('@/services/file.service', () => ({
  createFileRecord: vi.fn(),
}))

// Mock @/lib/redis
vi.mock('@/lib/redis', () => ({
  getRedisClient: vi.fn(),
}))

// Mock @/lib/email
vi.mock('@/lib/email', () => ({
  sendPasswordResetEmail: vi.fn(),
}))

// Mock @google/generative-ai
vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn(() => ({
    getGenerativeModel: vi.fn(() => ({
      startChat: vi.fn(() => ({
        sendMessageStream: vi.fn(),
      })),
    })),
  })),
}))

// Mock openai
vi.mock('openai', () => ({
  default: vi.fn(() => ({
    chat: {
      completions: {
        create: vi.fn(),
      },
    },
  })),
}))

// Mock puppeteer
vi.mock('puppeteer', () => ({
  default: {
    launch: vi.fn(() => ({
      newPage: vi.fn(() => ({
        emulateMediaType: vi.fn(),
        setContent: vi.fn(),
        waitForNetworkIdle: vi.fn(),
        evaluateHandle: vi.fn(),
        evaluate: vi.fn(),
        pdf: vi.fn(),
        close: vi.fn(),
      })),
      close: vi.fn(),
    })),
  },
}))

// Mock exceljs
vi.mock('exceljs', () => ({
  default: {
    Workbook: vi.fn(() => ({
      addWorksheet: vi.fn(() => ({
        getCell: vi.fn(() => ({ value: '', font: {}, alignment: {} })),
        mergeCells: vi.fn(),
        getColumn: vi.fn(() => ({ width: 0 })),
        pageSetup: {},
        headerFooter: {},
        views: [],
      })),
      xlsx: { writeBuffer: vi.fn() },
      creator: '',
      created: new Date(),
      properties: { date1904: false },
    }))
  },
}))