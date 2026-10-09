'use server'

import 'server-only'

import { z } from 'zod'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/db'
import { requireApiSession } from '@/lib/session'
import { PERMISSIONS } from '@/lib/permissions-data'
import { logAudit } from '@/lib/audit-log'
import { canManageAssignments } from '@/lib/record-scope'
import { findOrCreateCompanyByName } from '@/services/company.service'
import { findOrCreateContactByName } from '@/services/contact.service'
import { recomputeDealNextFollowUp } from '@/app/follow-ups/actions'
import { toMoney, computeLineTotal, sumMoney, toQuantity } from '@/lib/sales-money'
import { productOptionLabel } from '@/types/sales'
import { STAGE_PROBABILITIES, getStageProbability, getStageLabel } from '@/lib/deal-pipeline'
import {
  dealCaptureSchema,
  buildDealCaptureData,
  buildDealCaptureUpdateData,
  parseCaptureFormData,
} from '@/lib/deal-capture'
import {
  importLeadsFromFile,
  type LeadImportRow,
  type LeadImportRowError,
  type LeadImportWarning,
} from '@/lib/lead-import'

const STAGES = ['SUSPECT', 'PROSPECT', 'APPROACH_ANALYSE', 'NEGOTIATE', 'CLOSE', 'ORDER', 'PAYMENT', 'LOST'] as const

const lineItemSchema = z.object({
  productId: z.string().min(1, 'Product is required'),
  quantity: z.coerce.number().gt(0, 'Quantity must be greater than 0'),
  unitPrice: z.coerce.number().min(0, 'Unit price must be 0 or more'),
  unitCost: z.coerce.number().min(0, 'Unit cost must be 0 or more'),
})

type LineItem = z.infer<typeof lineItemSchema>

const lineItemsSchema = z.preprocess((val) => {
  if (val === undefined || val === null) return []
  if (typeof val === 'string') {
    const trimmed = val.trim()
    if (trimmed === '') return []
    try {
      return JSON.parse(trimmed)
    } catch {
      return undefined
    }
  }
  return val
}, z.array(lineItemSchema))

/**
 * A deal carries the whole enquiry — capture fields AND pipeline fields. The
 * capture half (everything the old lead form collected) comes from
 * `dealCaptureSchema` so the form, the update action and the sheet import all
 * validate identical input; the pipeline half is declared here.
 */
const dealSchema = dealCaptureSchema
  .safeExtend({
    contactName: z.string().trim().optional(),
    contactEmail: z.string().trim().email('Enter a valid email').optional().or(z.literal('')),
    contactMobile: z.string().trim().optional(),
    // Optional here because line items, when present, decide the value — the
    // old form made it required, which blocked creating a deal before pricing.
    value: z.coerce.number().min(0).optional(),
    probability: z.coerce.number().int().min(0).max(100).optional(),
    stage: z.enum(STAGES).optional(),
    expectedClose: z.string().trim().optional(),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
    ownerId: z.string().trim().optional(),
    paymentStatus: z.enum(['PENDING', 'PARTIALLY_PAID', 'PAID']).optional(),
    lostReason: z.string().trim().optional(),
    lineItems: lineItemsSchema,
  })
  .refine(
    (data) => {
      const email = data.contactEmail || ''
      const mobile = data.contactMobile || ''
      if (!email.trim() && !mobile.trim()) return true
      return Boolean((data.contactName || '').trim())
    },
    { message: 'Contact name is required when contact email or mobile is provided', path: ['contactName'] }
  )

export interface DealFormState {
  error?: string
  fieldErrors?: Record<string, string>
  success?: boolean
  createdId?: string
}

export interface DealProductOption {
  id: string
  label: string
  unit: string
  defaultUnitPrice: number | null
  unitPrice: number | null
  unitCost: number | null
}

async function validateCsrf(): Promise<void> {
  const headersList = await headers()
  const origin = headersList.get('origin')
  const host = headersList.get('host')

  if (!origin) return

  if (process.env.NODE_ENV === 'development') {
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) return
  }

  if (host) {
    try {
      const originHost = new URL(origin).host
      if (originHost === host) return
    } catch {
      // Invalid URL — fall through to throw
    }
  }

  throw new Error('CSRF validation failed: Invalid origin')
}

async function assertPermission(permission: string) {
  const session = await requireApiSession()
  if (!(session.user.permissions as string[]).includes(permission)) throw new Error('You do not have permission to do this.')
  return session
}

function computeDealValue(lineItems: LineItem[], fallback?: number): number {
  if (lineItems.length > 0) {
    return sumMoney(lineItems.map((li) => computeLineTotal(li.quantity, li.unitPrice))).toNumber()
  }
  return fallback ?? 0
}

async function createDealItems(dealId: string, organizationId: string, lineItems: LineItem[]): Promise<void> {
  if (lineItems.length === 0) return
  await prisma.dealItem.createMany({
    data: lineItems.map((li) => ({
      dealId,
      productId: li.productId,
      quantity: toQuantity(li.quantity),
      unitPrice: toMoney(li.unitPrice),
      unitCost: toMoney(li.unitCost),
      organizationId,
    })),
  })
}

async function replaceDealItems(dealId: string, organizationId: string, lineItems: LineItem[]): Promise<void> {
  await prisma.dealItem.deleteMany({ where: { dealId, organizationId } })
  await createDealItems(dealId, organizationId, lineItems)
}

export async function createDealAction(_prev: DealFormState, formData: FormData): Promise<DealFormState> {
  await validateCsrf()
  const session = await assertPermission(PERMISSIONS['deals.create'].name)
  const parsed = dealSchema.safeParse(parseCaptureFormData(formData))
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] = issue.message
    return { fieldErrors }
  }
  const data = parsed.data
  if (!canManageAssignments(session.user)) data.ownerId = session.user.id

  const company = data.company?.trim()
    ? await findOrCreateCompanyByName({
        name: data.company.trim(),
        organizationId: session.user.organizationId,
        ownerId: data.ownerId || session.user.id,
      })
    : null
  const companyId = company?.id ?? null
   const contact = data.contactName?.trim()
     ? await findOrCreateContactByName({
         email: data.email || data.contactEmail || null,
         mobile: data.contactMobile || null,
         phone: data.phone || null,
         address: null,
         name: data.contactName.trim(),
         organizationId: session.user.organizationId,
         ownerId: data.ownerId || session.user.id,
         companyId,
         designation: data.designation || null,
       })
    : null
  const contactId = contact?.id ?? null

  const lineItems: LineItem[] = data.lineItems ?? []
  const dealValue = computeDealValue(lineItems, data.value)
  const stage = data.stage ?? 'SUSPECT'

  const deal = await prisma.deal.create({
    data: {
      name: data.name,
      value: dealValue,
      probability: data.probability ?? getStageProbability(stage),
      stage,
      expectedClose: data.expectedClose ? new Date(data.expectedClose) : null,
      priority: data.priority ?? 'MEDIUM',
      segment: data.segment || null,
      companyId,
      contactId,
      organizationId: session.user.organizationId,
      ownerId: data.ownerId || session.user.id,
      paymentStatus: data.paymentStatus ?? 'PENDING',
      lostReason: data.lostReason || null,
      closedAt: (stage === 'LOST' || stage === 'PAYMENT') ? new Date() : null,
      lostAt: stage === 'LOST' ? new Date() : null,
      lastActivityAt: new Date(),
      // Capture half — same fields the lead form used to own.
      ...buildDealCaptureData(data),
      // The contact form fields double as the deal's own contact columns so
      // search and reports see them without joining through Contact.
      contactPerson: data.contactName || data.contactPerson || null,
      designation: data.designation ?? null,
      email: data.email || data.contactEmail || null,
      phone: data.phone || data.contactMobile || null,
      // nextFollowUp will be set via FollowUp table; keep column in sync
      nextFollowUp: data.nextFollowUp ? new Date(data.nextFollowUp) : null,
    },
  })

  // If nextFollowUp is provided, create a FollowUp row (single source of truth)
  if (data.nextFollowUp) {
    await prisma.followUp.create({
      data: {
        title: `Follow up on ${deal.name}`,
        description: '',
        dueDate: new Date(data.nextFollowUp),
        priority: data.priority ?? 'MEDIUM',
        status: 'PENDING',
        organizationId: session.user.organizationId,
        ownerId: data.ownerId || session.user.id,
        companyId,
        contactId,
        dealId: deal.id,
      },
    })
  }
  // Sync the Deal.nextFollowUp column from the FollowUp table
  await recomputeDealNextFollowUp(deal.id, session.user.organizationId)

  await createDealItems(deal.id, session.user.organizationId, lineItems)

  if (stage !== 'SUSPECT') {
    await prisma.dealStageHistory.create({
      data: {
        dealId: deal.id,
        stage,
        previousStage: null,
        probability: data.probability ?? getStageProbability(stage),
        movedById: session.user.id,
        movedByName: session.user.name ?? 'Unknown',
        organizationId: session.user.organizationId,
      },
    })
  }

  await prisma.activity.create({
    data: {
      type: 'DEAL_CREATED',
      description: `${session.user.name} created deal "${deal.name}"`,
      organizationId: session.user.organizationId,
      actorId: session.user.id,
      dealId: deal.id,
      companyId,
    },
  })

  await logAudit({
    organizationId: session.user.organizationId,
    actorId: session.user.id,
    action: 'CREATE',
    resource: 'Deal',
    resourceId: deal.id,
    metadata: { name: deal.name, value: deal.value, stage: deal.stage, lineItems: lineItems.length },
  })

  revalidatePath('/deals')
  revalidatePath('/dashboard')
  return { success: true, createdId: deal.id }
}

export async function updateDealAction(id: string, _prev: DealFormState, formData: FormData): Promise<DealFormState> {
  await validateCsrf()
  const session = await assertPermission(PERMISSIONS['deals.update'].name)
  const parsed = dealSchema.safeParse(parseCaptureFormData(formData))
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] = issue.message
    return { fieldErrors }
  }
  const data = parsed.data
  if (!canManageAssignments(session.user)) data.ownerId = session.user.id

  const existing = await prisma.deal.findFirst({ where: { id, organizationId: session.user.organizationId } })
  if (!existing) return { error: 'Deal not found.' }

  const company = data.company?.trim()
    ? await findOrCreateCompanyByName({
        name: data.company.trim(),
        organizationId: session.user.organizationId,
        ownerId: data.ownerId || existing.ownerId,
      })
    : null
  const rawCompany = formData.get('company')
  const companyId = rawCompany !== null ? (company?.id ?? null) : existing.companyId
  const contact = data.contactName?.trim()
    ? await findOrCreateContactByName({
        email: data.email || data.contactEmail || null,
        mobile: data.contactMobile || null,
        phone: data.phone || null,
        address: null,
        name: data.contactName.trim(),
        organizationId: session.user.organizationId,
        ownerId: data.ownerId || existing.ownerId,
        companyId,
        designation: data.designation || null,
      })
    : null
  const rawContact = formData.get('contactName')
  const contactId = rawContact !== null ? (contact?.id ?? null) : existing.contactId
  const notes = formData.get('notes')

  const lineItems: LineItem[] = data.lineItems ?? []
  const dealValue = computeDealValue(lineItems, data.value)

  if (formData.get('lineItems') !== null) {
    await replaceDealItems(id, session.user.organizationId, lineItems)
  }

  // nextFollowUp column is derived from the FollowUp table; the explicit
  // value from buildDealCaptureUpdateData is overridden here and re-synced
  // via recomputeDealNextFollowUp after the FollowUp rows are adjusted.
  await prisma.deal.update({
    where: { id },
    data: {
      name: data.name,
      value: dealValue,
      probability: data.probability ?? (data.stage ? getStageProbability(data.stage) : existing.probability),
      stage: data.stage ?? existing.stage,
      expectedClose: data.expectedClose ? new Date(data.expectedClose) : null,
      priority: data.priority ?? existing.priority,
      segment: data.segment || null,
      companyId,
      contactId,
      ownerId: data.ownerId || existing.ownerId,
      notes: typeof notes === 'string' && notes.trim() ? notes.trim() : existing.notes,
      paymentStatus: data.paymentStatus ?? existing.paymentStatus,
      lostReason: data.lostReason ?? existing.lostReason,
      closedAt: (data.stage === 'LOST' || data.stage === 'PAYMENT') ? (existing.closedAt ?? new Date()) : null,
      lostAt: data.stage === 'LOST' ? (existing.lostAt ?? new Date()) : null,
      lastActivityAt: new Date(),
      // Capture half — same fields the lead form used to own.
      ...buildDealCaptureUpdateData(data),
      contactPerson: data.contactName || data.contactPerson || null,
      designation: data.designation ?? null,
      email: data.email || data.contactEmail || null,
      phone: data.phone || data.contactMobile || null,
      // Let recomputeDealNextFollowUp derive this from the FollowUp table
      nextFollowUp: null,
    },
  })

  // Handle nextFollowUp: create, update or cancel FollowUp rows (single source of truth)
  if (data.nextFollowUp) {
    const existingFollowUp = await prisma.followUp.findFirst({
      where: { dealId: id, organizationId: session.user.organizationId, status: 'PENDING' },
      orderBy: { dueDate: 'asc' },
    })
    if (existingFollowUp) {
      await prisma.followUp.update({
        where: { id: existingFollowUp.id },
        data: {
          dueDate: new Date(data.nextFollowUp),
          priority: data.priority ?? existingFollowUp.priority,
          title: `Follow up on ${data.name}`,
        },
      })
    } else {
      await prisma.followUp.create({
        data: {
          title: `Follow up on ${data.name}`,
          description: '',
          dueDate: new Date(data.nextFollowUp),
          priority: data.priority ?? 'MEDIUM',
          status: 'PENDING',
          organizationId: session.user.organizationId,
          ownerId: data.ownerId || existing.ownerId,
          companyId,
          contactId,
          dealId: id,
        },
      })
    }
  } else {
    // Field cleared: cancel any pending follow-ups for this deal
    await prisma.followUp.updateMany({
      where: { dealId: id, organizationId: session.user.organizationId, status: 'PENDING' },
      data: { status: 'CANCELLED' },
    })
  }

  // Sync the Deal.nextFollowUp column from the (now updated) FollowUp table
  await recomputeDealNextFollowUp(id, session.user.organizationId)

  if (data.stage && data.stage !== existing.stage) {
    await prisma.dealStageHistory.create({
      data: {
        dealId: id,
        stage: data.stage,
        previousStage: existing.stage,
        probability: data.probability ?? getStageProbability(data.stage),
        movedById: session.user.id,
        movedByName: session.user.name ?? 'Unknown',
        organizationId: session.user.organizationId,
      },
    })
    await prisma.activity.create({
      data: {
        type: 'DEAL_UPDATED',
        description: `${session.user.name} moved "${existing.name}" to ${getStageLabel(data.stage)}`,
        organizationId: session.user.organizationId,
        actorId: session.user.id,
        dealId: id,
      },
    })
  }

  await logAudit({
    organizationId: session.user.organizationId,
    actorId: session.user.id,
    action: 'UPDATE',
    resource: 'Deal',
    resourceId: id,
    metadata: { name: data.name, changes: Object.keys(data), lineItems: lineItems.length },
  })

  revalidatePath('/deals')
  revalidatePath(`/deals/${id}`)
  revalidatePath('/dashboard')
  return { success: true }
}

export async function updateDealStageAction(dealId: string, stage: (typeof STAGES)[number], lostReason?: string): Promise<void> {
  await validateCsrf()
  const session = await assertPermission(PERMISSIONS['deals.update'].name)
  const deal = await prisma.deal.findFirst({ where: { id: dealId, organizationId: session.user.organizationId } })
  if (!deal || deal.stage === stage) return

  const previousStage = deal.stage as string
  const newProbability = stage === 'LOST' ? 0 : STAGE_PROBABILITIES[stage] ?? 0

  await prisma.deal.update({
    where: { id: dealId },
    data: {
      stage,
      probability: newProbability,
      paymentStatus: stage === 'PAYMENT' ? 'PENDING' : undefined,
      closedAt: stage === 'LOST' || stage === 'PAYMENT' ? new Date() : null,
      lostAt: stage === 'LOST' ? new Date() : null,
      lostReason: stage === 'LOST' ? (lostReason || null) : null,
    },
  })

  await prisma.dealStageHistory.create({
    data: {
      dealId,
      stage,
      previousStage: previousStage as typeof STAGES[number],
      probability: newProbability,
      movedById: session.user.id,
      movedByName: session.user.name ?? 'Unknown',
      organizationId: session.user.organizationId,
    },
  })
  await prisma.activity.create({
    data: {
      type: 'DEAL_UPDATED',
      description: `${session.user.name} moved "${deal.name}" to ${getStageLabel(stage)}`,
      organizationId: session.user.organizationId,
      actorId: session.user.id,
      dealId,
    },
  })

  await logAudit({
    organizationId: session.user.organizationId,
    actorId: session.user.id,
    action: 'UPDATE',
    resource: 'Deal',
    resourceId: dealId,
    metadata: { name: deal.name, stage, previousStage, probability: newProbability },
  })

  revalidatePath('/deals')
  revalidatePath('/dashboard')
}

export async function deleteDealAction(id: string): Promise<{ success?: boolean; error?: string }> {
  await validateCsrf()
  const session = await assertPermission(PERMISSIONS['deals.delete'].name)
  const existing = await prisma.deal.findFirst({ where: { id, organizationId: session.user.organizationId } })
  if (!existing) return { error: 'Deal not found.' }
  await prisma.deal.delete({ where: { id } })

  await logAudit({
    organizationId: session.user.organizationId,
    actorId: session.user.id,
    action: 'DELETE',
    resource: 'Deal',
    resourceId: id,
    metadata: { name: existing.name },
  })

  revalidatePath('/deals')
  revalidatePath('/dashboard')
  return { success: true }
}

export interface DealImportResult {
  error?: string
  created: number
  skipped: number
  rowErrors: LeadImportRowError[]
  warnings: LeadImportWarning[]
  notes: string[]
  rows: LeadImportRow[]
  /** 'xlsx' | 'csv' — reported back so the user knows what was actually read. */
  format?: string
  sheetName?: string
}

/**
 * Sheet import. Deals and leads are the same record now, so an uploaded
 * spreadsheet creates DEALS — each row entering the funnel at the stage its
 * Status column maps to, and at SUSPECT when the column is blank or
 * unrecognised. Validation, alias matching, dedupe and phone extraction stay
 * in the shared lib/lead-import.ts engine so they remain unit-tested.
 */
export async function importDealsAction(formData: FormData): Promise<DealImportResult> {
  await validateCsrf()
  let session
  try {
    session = await assertPermission(PERMISSIONS['deals.create'].name)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Not authorized'
    return { error: message, created: 0, skipped: 0, rowErrors: [], warnings: [], notes: [], rows: [] }
  }

  const file = formData.get('file')
  if (!file || !(file instanceof File)) {
    return { error: 'No file provided', created: 0, skipped: 0, rowErrors: [], warnings: [], notes: [], rows: [] }
  }

  // Pre-fetch existing deals for dedupe
  const existingDeals = await prisma.deal.findMany({
    where: { organizationId: session.user.organizationId },
    select: { email: true, name: true, company: { select: { name: true } } },
  })
  const existingEmails = new Set(
    existingDeals.map((d) => d.email?.toLowerCase()).filter((v): v is string => Boolean(v))
  )
  const existingNameCompanyKeys = new Set(
    existingDeals.map((d) => `${d.name.toLowerCase()}|${(d.company?.name ?? '').toLowerCase()}`)
  )

  let parsed: Awaited<ReturnType<typeof importLeadsFromFile>>
  try {
    parsed = await importLeadsFromFile(file, { existingEmails, existingNameCompanyKeys })
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Could not read that file.',
      created: 0,
      skipped: 0,
      rowErrors: [],
      warnings: [],
      notes: [],
      rows: [],
    }
  }

  const notes = [...parsed.notes]

  if (parsed.created === 0 && parsed.rowErrors.length === 0) {
    return {
      ...parsed,
      error: notes.join(' ') || 'No valid rows to import.',
    }
  }

  // Resolve companies once up front
  const companyNames = [
    ...new Set(parsed.rows.map((r) => r.company).filter((name): name is string => Boolean(name))),
  ]
  const companyIdByName = new Map<string, string>()
  for (const name of companyNames) {
    const resolved = await findOrCreateCompanyByName({
      name,
      organizationId: session.user.organizationId,
      ownerId: session.user.id,
    })
    if (resolved) {
      companyIdByName.set(name, resolved.id)
      companyIdByName.set(name.toLowerCase(), resolved.id)
    }
  }

  // Resolve contacts once up front (by name + company)
  const contactKeys = [
    ...new Set(
      parsed.rows
        .filter((r): r is typeof r & { contactPerson: string; company: string } => Boolean(r.contactPerson && r.company))
        .map((r) => `${r.contactPerson.trim()}|${r.company.trim()}`),
    ),
  ]
  // Gather the first non-empty email/phone for each contact key so the
  // Contact row carries the details (not just the Deal row).
  const contactDetailsByKey = new Map<string, { email: string | null; phone: string | null; designation: string | null }>()
  for (const row of parsed.rows) {
    if (!row.contactPerson || !row.company) continue
    const key = `${row.contactPerson.trim()}|${row.company.trim()}`
    if (!contactDetailsByKey.has(key)) {
      contactDetailsByKey.set(key, {
        email: row.email?.trim() || null,
        phone: row.phone?.trim() || null,
        designation: row.designation?.trim() || null,
      })
    }
  }
  const contactIdByKey = new Map<string, string>()
  for (const key of contactKeys) {
    const [contactName, companyName] = key.split('|')
    const companyId = companyIdByName.get(companyName) ?? companyIdByName.get(companyName.toLowerCase())
    const details = contactDetailsByKey.get(key)
    const resolved = await findOrCreateContactByName({
      name: contactName,
      organizationId: session.user.organizationId,
      ownerId: session.user.id,
      companyId: companyId ?? null,
      email: details?.email || null,
      phone: details?.phone || null,
      designation: details?.designation || null,
    })
    if (resolved) {
      contactIdByKey.set(key, resolved.id)
      contactIdByKey.set(key.toLowerCase(), resolved.id)
    }
  }

  // Owner assignment by email
  const ownerEmails = [
    ...new Set(
      parsed.rows
        .map((r) => r.email)
        .filter((email): email is string => Boolean(email))
    ),
  ]
  const ownerIdByEmail = new Map<string, string>()
  if (ownerEmails.length > 0) {
    const users = await prisma.user.findMany({
      where: { organizationId: session.user.organizationId, email: { in: ownerEmails } },
      select: { id: true, email: true, status: true },
    })
    for (const user of users) {
      if (user.status !== 'ACTIVE') {
        notes.push(`Ignored "${user.email}" as owner: the account is not active.`)
        continue
      }
      ownerIdByEmail.set(user.email.toLowerCase(), user.id)
    }
    const unresolved = ownerEmails.filter((email) => !ownerIdByEmail.has(email.toLowerCase()))
    if (unresolved.length > 0) {
      notes.push(
        `No active user matched these owner emails, so those deals were assigned to you: ${unresolved.slice(0, 5).join(', ')}.`
      )
    }
  }

  // One transaction over the whole sheet can outlive Prisma's 5s
  // default timeout: every row is its own round-trip, so a few
  // hundred rows push the interactive transaction past 5000ms and
  // the database expires it (the rollback itself then fails, which
  // is the "rollback cannot be executed on an expired transaction"
  // error). Create in chunks so each transaction stays short.
  // Chunks commit independently, and the dedupe sets above are
  // re-queried on every request, so a retried import skips rows
  // that already landed instead of creating duplicates.
  const IMPORT_CHUNK_SIZE = 100
  let created = 0
  for (let start = 0; start < parsed.rows.length; start += IMPORT_CHUNK_SIZE) {
    const chunk = parsed.rows.slice(start, start + IMPORT_CHUNK_SIZE)

    // Pre-compute derived IDs per row so they can be reused for FollowUp creation
    const rowsWithDealInfo = chunk.map((data) => {
      const ownerId = data.email
        ? (ownerIdByEmail.get(data.email.toLowerCase()) ?? session.user.id)
        : session.user.id
      const stage = data.stage ?? 'SUSPECT'
      const companyId = data.company
        ? (companyIdByName.get(data.company) ?? companyIdByName.get(data.company.toLowerCase()) ?? null)
        : null
      const contactKey = data.contactPerson && data.company
        ? `${data.contactPerson.trim()}|${data.company.trim()}`
        : null
      const contactId = contactKey
        ? (contactIdByKey.get(contactKey) ?? contactIdByKey.get(contactKey.toLowerCase()) ?? null)
        : null
      return { data, ownerId, stage, companyId, contactId }
    })

    const chunkCreated = await prisma.$transaction(
      rowsWithDealInfo.map(({ data, ownerId, stage, companyId, contactId }) =>
        prisma.deal.create({
          data: {
            name: data.name,
            // A sheet that carries no figure must not invent one — it would
            // inflate pipeline value in every report.
            value: toMoney(data.value ?? 0),
            stage,
            probability: getStageProbability(stage),
            organizationId: session.user.organizationId,
            ownerId,
            segment: data.segment || null,
            source: data.source || 'Import',
            score: data.score ?? 0,
            notes: data.notes || null,
            lastActivityAt: new Date(),
            companyId,
            contactId,
            contactPerson: data.contactPerson || null,
            designation: data.designation || null,
            email: data.email || null,
            phone: data.phone || null,
            meetingDate: data.meetingDate ?? null,
            meetingAt: data.meetingAt ?? null,
            productsDiscussed: data.productsDiscussed ?? [],
            customProductNames: data.customProductNames ?? [],
            keyDiscussionPoints: data.keyDiscussion || null,
            customerRequirement: data.requirement || null,
            grade: data.grade || null,
            cdaStatus: data.cdaStatus || null,
            samplingStatus: data.samplingStatus || null,
            rndFeedback: data.rdFeedback || null,
            remark: data.remark || null,
            nextFollowUp: data.nextFollowUp ?? null,
            loaStatus: data.loaStatus || null,
            city: data.city || null,
            country: data.country || null,
            pinCode: data.pinCode || null,
            purposeOfVisit: data.purposeOfVisit || null,
            application: data.application || null,
            applicationOther: data.applicationOther || null,
            closedAt: stage === 'LOST' || stage === 'PAYMENT' ? new Date() : null,
            lostAt: stage === 'LOST' ? new Date() : null,
          },
        })
      )
    )
    created += chunkCreated.length

    // Create FollowUp rows for deals with nextFollowUp, using the IDs
    // returned from the transaction instead of a separate findFirst query.
    for (let i = 0; i < rowsWithDealInfo.length; i++) {
      const { data, ownerId, companyId, contactId } = rowsWithDealInfo[i]
      const dealRecord = chunkCreated[i] as { id: string } | null | undefined
      if (data.nextFollowUp && dealRecord?.id) {
        await prisma.followUp.create({
          data: {
            title: `Follow up on ${data.name}`,
            description: '',
            dueDate: new Date(data.nextFollowUp),
            priority: 'MEDIUM',
            status: 'PENDING',
            organizationId: session.user.organizationId,
            ownerId,
            companyId,
            contactId,
            dealId: dealRecord.id,
          },
        })
      }
    }
  }

  await prisma.activity.create({
    data: {
      type: 'DEAL_CREATED',
      description: `${session.user.name} imported ${created} deal(s)`,
      organizationId: session.user.organizationId,
      actorId: session.user.id,
    },
  })

  await logAudit({
    organizationId: session.user.organizationId,
    actorId: session.user.id,
    action: 'CREATE',
    resource: 'Deal',
    metadata: { count: created, source: 'sheet-import' },
  })

  revalidatePath('/deals')
  revalidatePath('/dashboard')

  return {
    created,
    skipped: parsed.skipped,
    rowErrors: parsed.rowErrors,
    warnings: parsed.warnings,
    notes,
    rows: parsed.rows,
  }
}

// ============================================================
// Bulk actions. Every mutation is scoped to the caller's organization
// by a WHERE clause — an id from another org that was somehow forged
// into the request simply matches no row and is never touched.
// ============================================================

export interface BulkActionState {
  error?: string
  updated?: number
}

export async function bulkDeleteDealsAction(ids: string[]): Promise<BulkActionState> {
  await validateCsrf()
  if (ids.length === 0) return { updated: 0 }
  try {
    const session = await assertPermission(PERMISSIONS['deals.delete'].name)
    const result = await prisma.deal.deleteMany({
      where: { id: { in: ids }, organizationId: session.user.organizationId },
    })

    await logAudit({
      organizationId: session.user.organizationId,
      actorId: session.user.id,
      action: 'DELETE',
      resource: 'Deal',
      metadata: { count: result.count, ids },
    })

    revalidatePath('/deals')
    revalidatePath('/dashboard')
    return { updated: result.count }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to delete deals' }
  }
}

/**
 * Move several deals to one stage. Each move is recorded in DealStageHistory
 * and synced to the deal's probability, so bulk-moving doesn't quietly break
 * the win-rate and forecast numbers that stage transitions feed.
 */
export async function bulkUpdateDealStageAction(ids: string[], stage: string): Promise<BulkActionState> {
  await validateCsrf()
  if (ids.length === 0) return { updated: 0 }
  if (!STAGES.includes(stage as (typeof STAGES)[number])) return { error: 'Invalid stage' }

  try {
    const session = await assertPermission(PERMISSIONS['deals.update'].name)
    const deals = await prisma.deal.findMany({
      where: { id: { in: ids }, organizationId: session.user.organizationId },
      select: { id: true, name: true, stage: true },
    })
    const movable = deals.filter((d) => d.stage !== stage)
    if (movable.length === 0) return { updated: 0 }

    const now = new Date()
    const probability = STAGE_PROBABILITIES[stage as keyof typeof STAGE_PROBABILITIES] ?? 0
    await prisma.$transaction([
      prisma.deal.updateMany({
        where: { id: { in: movable.map((d) => d.id) }, organizationId: session.user.organizationId },
        data: {
          stage: stage as (typeof STAGES)[number],
          probability,
          closedAt: stage === 'LOST' || stage === 'PAYMENT' ? now : null,
          lostAt: stage === 'LOST' ? now : null,
        },
      }),
      prisma.dealStageHistory.createMany({
        data: movable.map((d) => ({
          dealId: d.id,
          stage: stage as (typeof STAGES)[number],
          previousStage: d.stage as (typeof STAGES)[number],
          probability,
          movedById: session.user.id,
          movedByName: session.user.name ?? 'Unknown',
          organizationId: session.user.organizationId,
        })),
      }),
      prisma.activity.create({
        data: {
          type: 'DEAL_UPDATED',
          description: `${session.user.name} moved ${movable.length} deal(s) to ${getStageLabel(stage)}`,
          organizationId: session.user.organizationId,
          actorId: session.user.id,
        },
      }),
    ])

    await logAudit({
      organizationId: session.user.organizationId,
      actorId: session.user.id,
      action: 'UPDATE',
      resource: 'Deal',
      metadata: { count: movable.length, stage, ids },
    })

    revalidatePath('/deals')
    revalidatePath('/dashboard')
    return { updated: movable.length }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to update deals' }
  }
}

export async function bulkReassignDealsAction(ids: string[], ownerId: string): Promise<BulkActionState> {
  await validateCsrf()
  if (ids.length === 0) return { updated: 0 }
  if (!ownerId) return { error: 'Select a person to reassign to' }

  try {
    const session = await assertPermission(PERMISSIONS['deals.update'].name)
    if (!canManageAssignments(session.user)) return { error: 'Only admins can reassign deals to other users' }
    const owner = await prisma.user.findFirst({
      where: { id: ownerId, organizationId: session.user.organizationId },
    })
    if (!owner) return { error: 'Selected owner not found' }

    const result = await prisma.deal.updateMany({
      where: { id: { in: ids }, organizationId: session.user.organizationId },
      data: { ownerId },
    })

    await logAudit({
      organizationId: session.user.organizationId,
      actorId: session.user.id,
      action: 'UPDATE',
      resource: 'Deal',
      metadata: { count: result.count, ownerId, ids },
    })

    revalidatePath('/deals')
    revalidatePath('/dashboard')
    return { updated: result.count }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to reassign deals' }
  }
}

export async function backfillDealFollowUpsAction(): Promise<{ created: number; error?: string }> {
  await validateCsrf()
  const session = await assertPermission(PERMISSIONS['deals.update'].name)

  try {
    // Find deals with nextFollowUp set but no PENDING follow-up
    const deals = await prisma.deal.findMany({
      where: {
        organizationId: session.user.organizationId,
        nextFollowUp: { not: null },
        followUps: { none: { status: 'PENDING' } },
      },
      select: {
        id: true,
        name: true,
        nextFollowUp: true,
        companyId: true,
        contactId: true,
        ownerId: true,
        priority: true,
      },
    })

    let created = 0
    for (const deal of deals) {
      if (!deal.nextFollowUp) continue
      await prisma.followUp.create({
        data: {
          title: `Follow up on ${deal.name}`,
          description: '',
          dueDate: deal.nextFollowUp,
          priority: deal.priority ?? 'MEDIUM',
          status: 'PENDING',
          organizationId: session.user.organizationId,
          ownerId: deal.ownerId,
          companyId: deal.companyId,
          contactId: deal.contactId,
          dealId: deal.id,
        },
      })
      created++
    }

    revalidatePath('/deals')
    revalidatePath('/dashboard')
    revalidatePath('/follow-ups')
    return { created }
  } catch (err) {
    return { created: 0, error: err instanceof Error ? err.message : 'Failed to backfill follow-ups' }
  }
}

export async function getDealLineItemOptions(): Promise<DealProductOption[]> {
  const session = await requireApiSession()
  const orgId = session.user.organizationId

  // TEMPORARY diagnostics: remove once the dropdown works.
  // Read the output in the SERVER terminal, not the browser console.
  const [total, inOrg, inOrgActive] = await Promise.all([
    prisma.product.count(),
    prisma.product.count({ where: { organizationId: orgId } }),
    prisma.product.count({ where: { organizationId: orgId, isActive: true } }),
  ])
  console.log('[getDealLineItemOptions]', { orgId, total, inOrg, inOrgActive })

  const rows = await prisma.product.findMany({
    where: { organizationId: orgId, isActive: true },
    select: {
      id: true,
      name: true,
      variant: true,
      unit: true,
      defaultUnitPrice: true,
      unitPrice: true,
      unitCost: true,
    },
    orderBy: [{ name: 'asc' }, { variant: 'asc' }],
  })

  return rows.map((r) => ({
    id: r.id,
    label: productOptionLabel({ name: r.name, variant: r.variant }),
    unit: r.unit ?? 'kg',
    defaultUnitPrice: r.defaultUnitPrice != null ? toMoney(r.defaultUnitPrice).toNumber() : null,
    unitPrice: r.unitPrice != null ? toMoney(r.unitPrice).toNumber() : null,
    unitCost: r.unitCost != null ? toMoney(r.unitCost).toNumber() : null,
  }))
}