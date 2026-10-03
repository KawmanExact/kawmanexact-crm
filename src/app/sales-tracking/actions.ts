'use server'

/**
 * Sales Product Tracking server actions.
 *
 * One form submission writes one SalesTransaction row PER PRODUCT LINE, all
 * sharing groupId / invoiceNumber / invoiceKey / saleDate / salesperson /
 * customer, inside a single prisma.$transaction so a failure leaves no partial
 * invoice behind.
 *
 * Server is authoritative: the client sends only quantity, unitPrice,
 * amountPaid and paymentStatus. totalAmount, balanceAmount and the final
 * paymentStatus are recomputed here from Decimals (see deriveLineMoney).
 */
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { Prisma } from '@/generated/prisma'
import { validateCsrf } from '@/lib/csrf'
import { requireApiSession } from '@/lib/session'
import { logAudit } from '@/lib/audit-log'
import { PERMISSIONS } from '@/lib/permissions-data'
import { salesFormSchema, type SalesFormInput } from '@/lib/sales-schema'
import {
  buildInvoiceKey,
  INVOICE_NUMBER_MAX,
  OTHER_PRODUCT_SENTINEL,
  otherProductNameIsValid,
} from '@/lib/sales-money'
import { funnelStageForPaymentState } from '@/lib/funnel'
import { prisma } from '@/lib/db'
import { deriveLineMoney } from '@/services/sales.service'

export interface SalesFormState {
  error?: string
  fieldErrors?: Record<string, string>
  /** Non-blocking information, e.g. the open-lead stage could not be moved. */
  notice?: string
  success?: boolean
  groupId?: string
}

async function assertPermission(permission: string) {
  const session = await requireApiSession()
  if (!(session.user.permissions as string[]).includes(permission)) {
    throw new Error('You do not have permission to do this.')
  }
  return session
}

/** Parse the `lines` JSON hidden input written by the multi-line form. */
export function parseLinesField(raw: FormDataEntryValue | null): unknown {
  if (typeof raw !== 'string' || raw.trim() === '') return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function fieldErrorsFromZod(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {}
  for (const issue of error.issues) {
    // Line-level issues are prefixed `lines.0` by the caller; the shared schema
    // reports bare paths, which map straight onto form fields.
    const key = String(issue.path[0] ?? 'form')
    if (!fieldErrors[key]) fieldErrors[key] = issue.message
  }
  return fieldErrors
}

/**
 * Invoice numbers are unique per organisation, case-insensitively. An invoice
 * already used by a DIFFERENT groupId is rejected; the same groupId is allowed
 * so editing a sale can keep (and re-save) its own number.
 */
export async function findConflictingInvoiceGroup(input: {
  organizationId: string
  invoiceKey: string
  groupId?: string
}): Promise<string | null> {
  const existing = await prisma.salesTransaction.findFirst({
    where: {
      organizationId: input.organizationId,
      invoiceKey: input.invoiceKey,
      ...(input.groupId ? { NOT: { groupId: input.groupId } } : {}),
    },
    select: { groupId: true },
  })
  return existing?.groupId ?? null
}

/**
 * Optional checkbox: move the customer's open lead to Order/Payment. Only acts
 * when the customer has EXACTLY one open lead — never guess between several.
 * Returns the moved lead id, or a reason string explaining why not.
 */
export async function moveCustomerLeadStage(
  organizationId: string,
  customerId: string,
  fullyPaid: boolean
): Promise<{ leadId?: string; skipped?: string }> {
  const openLeads = await prisma.lead.findMany({
    where: {
      organizationId,
      companyId: customerId,
      NOT: { status: 'LOST' },
    },
    select: { id: true },
    take: 2,
  })
  if (openLeads.length === 0) return { skipped: 'No open lead for this customer.' }
  if (openLeads.length > 1) {
    return { skipped: 'This customer has more than one open lead — stage not changed automatically.' }
  }
  const stage = funnelStageForPaymentState(fullyPaid)
  await prisma.lead.update({ where: { id: openLeads[0].id }, data: { funnelStage: stage } })
  return { leadId: openLeads[0].id }
}

interface PreparedLine {
  productId: string | null
  otherProductName: string | null
  quantity: Prisma.Decimal
  unitPrice: Prisma.Decimal
  totalAmount: Prisma.Decimal
  amountPaid: Prisma.Decimal
  balanceAmount: Prisma.Decimal
  paymentStatus: 'PAID' | 'PARTIALLY_PAID' | 'PENDING'
  paymentDate: Date | null
}

function prepareLines(data: SalesFormInput): PreparedLine[] {
  const saleDate = new Date(data.saleDate)
  const paymentDate = data.paymentDate ? new Date(data.paymentDate) : null

  return data.lines.map((line) => {
    const money = deriveLineMoney({
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      amountPaid: line.amountPaid,
    })
    const usesOther = line.productId === OTHER_PRODUCT_SENTINEL
    return {
      productId: usesOther ? null : line.productId || null,
      otherProductName: usesOther ? line.otherProductName.trim() : null,
      quantity: money.quantity,
      unitPrice: money.unitPrice,
      totalAmount: money.totalAmount,
      amountPaid: money.amountPaid,
      balanceAmount: money.balanceAmount,
      paymentStatus: money.paymentStatus,
      paymentDate: money.amountPaid.greaterThan(0) ? paymentDate : null,
    }
  })
}

/**
 * Verify every referenced catalog product exists, is active and belongs to this
 * organisation. Runs before the write so a stale dropdown cannot write a
 * cross-tenant productId.
 */
async function assertProductsUsable(
  organizationId: string,
  lines: PreparedLine[]
): Promise<{ ok: true } | { ok: false; message: string }> {
  const ids = Array.from(new Set(lines.map((l) => l.productId).filter((id): id is string => !!id)))
  if (ids.length === 0) return { ok: true }

  const products = await prisma.product.findMany({
    where: { organizationId, id: { in: ids } },
    select: { id: true, name: true, variant: true, isActive: true },
  })
  if (products.length !== ids.length) {
    return { ok: false, message: 'One of the selected products no longer exists. Reload the page.' }
  }
  const inactive = products.find((p) => !p.isActive)
  if (inactive) {
    return {
      ok: false,
      message: `"${inactive.name}${inactive.variant ? ` (${inactive.variant})` : ''}" is deactivated and cannot be sold.`,
    }
  }
  return { ok: true }
}

async function assertCustomerUsable(
  organizationId: string,
  customerId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const customer = await prisma.company.findFirst({
    where: { id: customerId, organizationId },
    select: { id: true },
  })
  if (!customer) return { ok: false, message: 'Customer not found in this organisation.' }
  return { ok: true }
}

async function assertSalespersonUsable(
  organizationId: string,
  salespersonId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const user = await prisma.user.findFirst({
    where: { id: salespersonId, organizationId, status: 'ACTIVE' },
    select: { id: true },
  })
  if (!user) return { ok: false, message: 'Salesperson not found or inactive in this organisation.' }
  return { ok: true }
}

/** A salesperson other than me may only be chosen by sales.view_all holders. */
function salespersonForcedToSelf(session: Awaited<ReturnType<typeof assertPermission>>): boolean {
  return !(session.user.permissions as string[]).includes(PERMISSIONS['sales.view_all'].name)
}

export async function saveSaleAction(
  _prev: SalesFormState,
  formData: FormData
): Promise<SalesFormState> {
  await validateCsrf()
  const session = await assertPermission(PERMISSIONS['sales.create'].name)

  return runSave(session, formData, false)
}

export async function updateSaleAction(
  _prev: SalesFormState,
  formData: FormData
): Promise<SalesFormState> {
  await validateCsrf()
  const session = await assertPermission(PERMISSIONS['sales.update'].name)

  return runSave(session, formData, true)
}

async function runSave(
  session: Awaited<ReturnType<typeof assertPermission>>,
  formData: FormData,
  isUpdate: boolean
): Promise<SalesFormState> {
  const organizationId = session.user.organizationId
  const groupId = String(formData.get('groupId') ?? '').trim()

  const raw = {
    salespersonId: String(formData.get('salespersonId') ?? '').trim(),
    customerId: String(formData.get('customerId') ?? '').trim(),
    saleDate: String(formData.get('saleDate') ?? '').trim(),
    paymentDate: String(formData.get('paymentDate') ?? '').trim(),
    invoiceNumber: String(formData.get('invoiceNumber') ?? '').trim(),
    remarks: String(formData.get('remarks') ?? '').trim(),
    moveLeadStage: formData.get('moveLeadStage') === 'on' || formData.get('moveLeadStage') === 'true',
    lines: parseLinesField(formData.get('lines')),
  }

  // A salesperson may only file the sale under their own name unless they hold
  // sales.view_all. Forced server-side — hiding the dropdown is not enough.
  const salespersonId = salespersonForcedToSelf(session) ? session.user.id : raw.salespersonId || session.user.id

  const parsed = salesFormSchema.safeParse({ ...raw, salespersonId })
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFromZod(parsed.error) }
  }
  const data = parsed.data

  if (data.invoiceNumber.length > INVOICE_NUMBER_MAX) {
    return { fieldErrors: { invoiceNumber: `Invoice number must be ${INVOICE_NUMBER_MAX} characters or fewer` } }
  }

  // "Other" product names are re-validated here because `lines` is raw JSON.
  for (const [index, line] of data.lines.entries()) {
    if (line.productId === OTHER_PRODUCT_SENTINEL || (!line.productId && line.otherProductName)) {
      const problem = otherProductNameIsValid(line.otherProductName)
      if (problem) return { fieldErrors: { [`lines.${index}.otherProductName`]: problem } }
    }
  }

  const invoiceKey = buildInvoiceKey(data.invoiceNumber)
  const conflict = await findConflictingInvoiceGroup({
    organizationId,
    invoiceKey,
    ...(groupId ? { groupId } : {}),
  })
  if (conflict) {
    return {
      fieldErrors: {
        invoiceNumber: `Invoice number "${data.invoiceNumber}" is already used by another sale.`,
      },
    }
  }

  const lines = prepareLines(data)

  const [customerCheck, salespersonCheck, productCheck] = await Promise.all([
    assertCustomerUsable(organizationId, data.customerId),
    assertSalespersonUsable(organizationId, salespersonId),
    assertProductsUsable(organizationId, lines),
  ])
  for (const check of [customerCheck, salespersonCheck, productCheck]) {
    if (!check.ok) return { error: check.message }
  }

  const saleDate = new Date(data.saleDate)
  const targetGroupId = isUpdate && groupId ? groupId : newGroupId()

  try {
    await prisma.$transaction(async (tx) => {
      if (isUpdate && groupId) {
        // Delete the old lines and rewrite them, so line count can change on edit.
        await tx.salesTransaction.deleteMany({ where: { organizationId, groupId } })
      }

      await tx.salesTransaction.createMany({
        data: lines.map((line, index) => ({
          organizationId,
          salespersonId,
          customerId: data.customerId,
          saleDate,
          invoiceNumber: data.invoiceNumber,
          invoiceKey,
          groupId: targetGroupId,
          lineNumber: index + 1,
          remarks: data.remarks || null,
          ...line,
        })),
      })

      await tx.auditLog.create({
        data: {
          organizationId,
          actorId: session.user.id,
          action: isUpdate ? 'UPDATE' : 'CREATE',
          resource: 'SalesTransaction',
          resourceId: targetGroupId,
          metadata: {
            invoiceNumber: data.invoiceNumber,
            customerId: data.customerId,
            salespersonId,
            lineCount: lines.length,
            moveLeadStage: data.moveLeadStage,
          } as never,
        },
      })
    })
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not save the sale.' }
  }

  let leadNote: string | undefined
  if (data.moveLeadStage) {
    const fullyPaid = lines.every((line) => line.paymentStatus === 'PAID')
    const result = await moveCustomerLeadStage(organizationId, data.customerId, fullyPaid)
    leadNote = result.skipped
  }

  revalidatePath('/sales-tracking')
  revalidatePath('/leads')
  revalidatePath('/funnel')

  // "Could not stage the lead" is informational, not a failure of the sale, so
  // it rides on its own channel instead of `error`.
  return { success: true, groupId: targetGroupId, notice: leadNote }
}

function newGroupId(): string {
  return `grp_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`
}

/** Delete every line of one sale (one invoice) and audit it. */
export async function deleteSaleAction(
  groupId: string
): Promise<{ success?: boolean; error?: string }> {
  await validateCsrf()
  const session = await assertPermission(PERMISSIONS['sales.delete'].name)

  try {
    const result = await prisma.salesTransaction.deleteMany({
      where: { organizationId: session.user.organizationId, groupId },
    })
    if (result.count === 0) return { error: 'Sale not found.' }
    await logAudit({
      organizationId: session.user.organizationId,
      actorId: session.user.id,
      action: 'DELETE',
      resource: 'SalesTransaction',
      resourceId: groupId,
      metadata: { lineCount: result.count },
    })
    revalidatePath('/sales-tracking')
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not delete the sale.' }
  }
}

/** Row-level edit/delete rights, so the UI never offers an action that 403s. */
export async function saleRowCapabilities(
  groupId: string
): Promise<{ canEdit: boolean; canDelete: boolean }> {
  const session = await requireApiSession()
  const perms = session.user.permissions as string[]
  const row = await prisma.salesTransaction.findFirst({
    where: { organizationId: session.user.organizationId, groupId },
    select: { salespersonId: true },
  })
  if (!row) return { canEdit: false, canDelete: false }
  const canEdit = perms.includes(PERMISSIONS['sales.update'].name)
  const canDelete = perms.includes(PERMISSIONS['sales.delete'].name)
  return { canEdit, canDelete }
}
