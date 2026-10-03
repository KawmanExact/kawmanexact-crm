import { prisma } from '@/lib/db'
import type { AuditAction } from '@/generated/prisma'

interface AuditInput {
  organizationId: string
  actorId: string
  action: AuditAction
  resource: string
  resourceId?: string
  metadata?: Record<string, unknown>
}

export async function logAudit(input: AuditInput) {
  await prisma.auditLog.create({
    data: {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: input.action,
      resource: input.resource,
      resourceId: input.resourceId,
      metadata: input.metadata as never,
    },
  })
}
