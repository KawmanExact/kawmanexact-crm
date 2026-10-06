/**
 * Lead-specific file importer.
 *
 * Wraps the generic spreadsheet/csv parsers in `sheet-import.ts` with the
 * column aliases, row normalisation, status/segment mapping, dedupe and phone
 * extraction the sales sheet needs. No `server-only` marker so it can be
 * unit-tested without Prisma or a session.
 */
import {
  parseDelimited,
  parseSheetFile,
  normalizeHeader,
  applyHeaderMapping,
  normalizeImportDate,
  type ParsedSheet,
} from './sheet-import'
import { isStandardProduct } from '@/lib/products'
import { APPLICATION_OPTIONS, APPLICATION_OTHER } from './lead-dropdown-options'
import { mapOldStageToNew } from '@/lib/deal-pipeline'
import type { DealStage } from '@/types/crm'

const DEAL_STAGE_IDS = ['SUSPECT', 'PROSPECT', 'APPROACH_ANALYSE', 'NEGOTIATE', 'CLOSE', 'ORDER', 'PAYMENT', 'LOST']

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export const SHEET_ACCEPTED_EXTENSIONS = ['.csv', '.xlsx', '.xlsm'] as const

export interface LeadImportRowError {
  row: number
  message: string
}

export interface LeadImportWarning {
  row: number
  message: string
}

export interface LeadImportRow {
  name: string
  company?: string
  contactPerson?: string
  email?: string
  phone?: string
  source?: string
  segment?: string
  status?: string
  /** Pipeline stage the row lands in. Deals absorb leads, so the sheet's
   *  Status/Stage column maps straight onto the deal funnel; anything blank or
   *  unrecognised enters at SUSPECT, the top of the pipeline. */
  stage?: DealStage
  notes?: string
  /** Optional deal value. Absent or blank means zero — never guessed. */
  value?: number
  /** Lead score 0-100, clamped. */
  score?: number
  designation?: string
  meetingDate?: Date | null
  meetingAt?: string
  productsDiscussed?: string[]
  customProductNames?: string[]
  keyDiscussion?: string
  requirement?: string
  grade?: string
  cdaStatus?: string
  samplingStatus?: string
  rdFeedback?: string
  remark?: string
  nextFollowUp?: Date | null
  loaStatus?: string
  application?: string
  applicationOther?: string
  city?: string
  country?: string
  pinCode?: string
  purposeOfVisit?: string
}

export interface LeadImportResult {
  created: number
  skipped: number
  rowErrors: LeadImportRowError[]
  warnings: LeadImportWarning[]
  notes: string[]
  rows: LeadImportRow[]
}

export interface LeadImportOptions {
  /** Set of lower-cased emails that already exist in the org. */
  existingEmails?: Set<string>
  /** Set of `lower(name)|lower(company)` keys that already exist. */
  existingNameCompanyKeys?: Set<string>
}

// ---------------------------------------------------------------------------
// Header aliases — case/space/punctuation-insensitive
// ---------------------------------------------------------------------------

export const LEAD_IMPORT_HEADER_ALIASES: Record<string, string[]> = {
  name: ['name', 'leadname', 'contactname', 'contact', 'fullname', 'clientname'],
  company: ['company', 'companyname', 'organisation', 'organization', 'account', 'customer', 'customername', 'firm'],
  email: ['email', 'emailaddress', 'mail', 'contactemail'],
  phone: ['phone', 'phonenumber', 'mobile', 'mobilenumber', 'contactnumber', 'telephone', 'tel'],
  source: ['source', 'leadsource', 'leadsrc'],
  segment: ['segment', 'category', 'productsdiscussed', 'product', 'productcategory'],
  status: ['status', 'leadstatus', 'stage'],
  score: ['score', 'leadscore', 'rating'],
  value: ['value', 'leadvalue', 'dealvalue', 'amount', 'dealvalueinr', 'expectedvalue', 'wvalue'],
  notes: ['notes', 'note', 'remarks', 'comment', 'comments', 'description', 'followupnotes'],
  ownerEmail: ['owneremail', 'owner', 'assignedto', 'salesperson', 'salespersonemail', 'assignee'],
  lastActivityAt: ['lastactivity', 'lastactivityat', 'lastcontacted', 'lastcontact', 'lastfollowedup', 'lastactivitydate'],
  contactPerson: ['contactperson', 'contactname'],
  designation: ['designation', 'contactdesignation', 'persondesignation'],
  meetingDate: ['date', 'meetingdate', 'dateofmeeting', 'meetingdate'],
  meetingAt: ['meetingat', 'meetinglocation', 'meetingplace', 'meetingvenue'],
  productsDiscussed: ['productsdiscussed', 'products', 'productdiscussed'],
  customProductNames: ['customproductnames', 'customproducts', 'otherproducts'],
  keyDiscussion: ['keydiscussion', 'keydiscussionpoints', 'discussionpoints', 'keypoints'],
  requirement: ['requirement', 'customerrequirement', 'customerrequirement', 'custreq'],
  grade: ['grade'],
  cdaStatus: ['cdastatus', 'cdastatusdate', 'cda status', 'cda'],
  samplingStatus: ['samplingstatus', 'sampling', 'samplestatus', 'samplingstatusdate'],
  rdFeedback: ['rndfeedback', 'rnd feedback', 'r&d feedback', 'rd feedback', 'feedbackfromrnd', 'feedbackfromrdteam'],
  remark: ['remark'],
  nextFollowUp: ['nextfollowup', 'nextfollowup', 'nextfollow-up', 'nextaction'],
  loaStatus: ['loastatus', 'loa -', 'loa', 'loa status'],
  application: ['application', 'applications', 'product application', 'app'],
  applicationOther: ['application other', 'applicationother', 'app other'],
  city: ['city'],
  country: ['country'],
  pinCode: ['pincode', 'pin code', 'zip', 'zipcode', 'zip code', 'pincode'],
  purposeOfVisit: ['purposeofvisit', 'purposeofvisit', 'purposeofvisit', 'visitpurpose', 'purposeofmeeting'],
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BLANK_VALUES = new Set(['', 'na', 'n/a', '-'])

function clean(value: string | undefined | null): string | undefined {
  if (value === null || value === undefined) return undefined
  const trimmed = value.trim()
  return BLANK_VALUES.has(trimmed.toLowerCase()) ? undefined : trimmed
}

const STATUS_MAP: Record<string, string> = {
  open: 'CONTACTED',
  hold: 'CONTACTED',
  active: 'CONTACTED',
  close: 'LOST',
  closed: 'LOST',
}

function mapStatus(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  const upper = raw.trim().toUpperCase()
  if (['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST'].includes(upper)) return upper
  const mapped = STATUS_MAP[raw.trim().toLowerCase()]
  return mapped || upper
}

/**
 * Sheet status -> pipeline stage. The old lead statuses and the deal stages
 * line up one-to-one (see mapOldStageToNew), and a sheet that already speaks
 * in deal stages is passed through. Anything missing or unrecognised becomes
 * SUSPECT rather than being dropped, so a new enquiry always enters the
 * pipeline at the top instead of failing to import.
 */
function mapStage(status: string | undefined): DealStage {
  if (!status) return 'SUSPECT'
  const upper = status.trim().toUpperCase()
  if (DEAL_STAGE_IDS.includes(upper)) return upper as DealStage
  return mapOldStageToNew(upper)
}

function mapSegmentFromGrade(grade: string | undefined): string | undefined {
  if (!grade) return undefined
  const g = grade.toLowerCase()
  if (g.includes('pharmaceutical') && g.includes('nutraceutical')) {
    return g.indexOf('pharmaceutical') < g.indexOf('nutraceutical') ? 'PHARMACEUTICAL' : 'NUTRACEUTICAL'
  }
  if (g.includes('pharmaceutical')) return 'PHARMACEUTICAL'
  if (g.includes('nutraceutical')) return 'NUTRACEUTICAL'
  if (g.includes('cosmetic')) return 'COSMETICS'
  if (g.includes('food') || g.includes('all')) return 'FUNCTIONAL/OTHER'
  return undefined
}

function excelSerialToDate(serial: number): Date | null {
  const epoch = new Date(Date.UTC(1899, 11, 30))
  const result = new Date(epoch.getTime() + serial * 86400000)
  if (Number.isNaN(result.getTime())) return null
  return result
}

function parseMoney(raw: string | undefined): number | undefined {
  const cleaned = clean(raw)
  if (!cleaned) return undefined
  // Sheets write "₹5,00,000", "500000.00", "(1200)" for negatives.
  const negative = /^\(.*\)$/.test(cleaned)
  const digits = cleaned.replace(/[^0-9.-]/g, '')
  if (!digits || digits === '-' || digits === '.') return undefined
  const parsed = Number(digits)
  if (!Number.isFinite(parsed)) return undefined
  return negative ? -Math.abs(parsed) : parsed
}

function parseScore(raw: string | undefined): number | undefined {
  const value = parseMoney(raw)
  if (value === undefined) return undefined
  return Math.max(0, Math.min(100, Math.round(value)))
}

function tryParseExcelDate(value: string): Date | null {
  if (!value || isNaN(Number(value))) return null
  const serial = Number(value)
  if (serial < 1 || serial > 500000) return null
  return excelSerialToDate(serial)
}

function parseDateField(raw: string | undefined): Date | null {
  if (raw === null || raw === undefined) return null
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const excelDate = tryParseExcelDate(trimmed)
  if (excelDate) return excelDate
  return normalizeImportDate(trimmed)
}

function extractPhoneFromRemark(remark: string | undefined, existingPhone: string | undefined): string | undefined {
  if (existingPhone && existingPhone.trim() !== '') return existingPhone
  if (!remark || remark.trim() === '') return existingPhone
  const match = remark.match(/contact\s*no\.?:\s*([\d\s+-]+)/i)
  if (match) return match[1].replace(/\s+/g, ' ').trim()
  return existingPhone
}

function parseProducts(raw: string | undefined): { productsDiscussed: string[]; customProductNames: string[] } {
  const allProducts = splitProducts(raw)
  if (!allProducts || allProducts.length === 0) {
    return { productsDiscussed: [], customProductNames: [] }
  }
  
  const productsDiscussed: string[] = []
  const customProductNames: string[] = []
  
  for (const product of allProducts) {
    if (isStandardProduct(product)) {
      productsDiscussed.push(product)
    } else {
      customProductNames.push(product)
    }
  }
  
  return { productsDiscussed, customProductNames }
}

function splitProducts(raw: string | undefined): string[] | undefined {
  if (raw === null || raw === undefined || raw.trim() === '') return undefined
  return raw
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

// ---------------------------------------------------------------------------
// Header mapping (local, extended alias set)
// ---------------------------------------------------------------------------

export function mapLeadHeaders(headers: string[]): {
  mapping: Record<string, string>
  matched: string[]
  unmappedHeaders: string[]
  missingRequired: string[]
} {
  const normalized = headers.map(normalizeHeader)
  const mapping: Record<string, string> = {}
  const matchedHeaders = new Set<string>()

  for (const [field, aliases] of Object.entries(LEAD_IMPORT_HEADER_ALIASES)) {
    for (const alias of aliases) {
      const index = normalized.indexOf(alias)
      if (index !== -1 && headers[index]) {
        mapping[headers[index]] = field
        matchedHeaders.add(headers[index])
        break
      }
    }
  }
  for (const [field, aliases] of Object.entries(LEAD_IMPORT_HEADER_ALIASES)) {
    if (Object.values(mapping).includes(field)) continue
    for (const alias of aliases) {
      const index = normalized.findIndex(
        (candidate, i) => !matchedHeaders.has(headers[i]) && candidate.includes(alias)
      )
      if (index !== -1 && headers[index]) {
        mapping[headers[index]] = field
        matchedHeaders.add(headers[index])
        break
      }
    }
  }

  return {
    mapping,
    matched: Array.from(matchedHeaders),
    unmappedHeaders: headers.filter((header) => header && !matchedHeaders.has(header)),
    missingRequired: [],
  }
}

// ---------------------------------------------------------------------------
// Row normalisation / validation
// ---------------------------------------------------------------------------

export function normalizeLeadRow(
  mapped: Record<string, string>,
  rowIndex: number
): { data: LeadImportRow; errors: string[]; warnings: LeadImportWarning[] } | null {
  const errors: string[] = []
  const warnings: LeadImportWarning[] = []

  const name = clean(mapped.name) || clean(mapped.contactPerson) || clean(mapped.company) || ''
  if (name.length < 2) {
    errors.push('Name is required (min 2 characters)')
    return { data: { name: '' }, errors, warnings }
  }

  const email = clean(mapped.email)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  const validEmail = email && emailRegex.test(email) ? email : undefined
  if (email && !validEmail) {
    warnings.push({ row: rowIndex, message: `Invalid email "${email}" — imported without it.` })
  }

  const phone = clean(mapped.phone)
  const remark = clean(mapped.remark)
  const finalPhone = extractPhoneFromRemark(remark, phone)

  const status = mapStatus(mapped.status)
  if (mapped.status && !status) {
    errors.push(`Invalid status "${mapped.status}"`)
  }

  const segment = mapped.segment || mapSegmentFromGrade(mapped.grade)

  // Map application - match case-insensitively to canonical options
  const rawApplication = clean(mapped.application)
  let application: string | undefined = rawApplication
  let applicationOther: string | undefined
  if (application) {
    const canonical = APPLICATION_OPTIONS.find((opt) => opt.toLowerCase() === application!.toLowerCase())
    if (canonical) {
      application = canonical
    } else {
      applicationOther = application
      application = APPLICATION_OTHER
    }
  }

  const data: LeadImportRow = {
    name,
    company: clean(mapped.company),
    contactPerson: clean(mapped.contactPerson),
    email: validEmail,
    phone: finalPhone,
    source: clean(mapped.source) || 'Import',
    segment,
    status,
    stage: mapStage(status),
    value: parseMoney(mapped.value),
    score: parseScore(mapped.score),
    notes: clean(mapped.notes) || clean(mapped.remark),
    designation: clean(mapped.designation),
    meetingDate: parseDateField(mapped.meetingDate),
    meetingAt: clean(mapped.meetingAt),
    ...parseProducts(mapped.productsDiscussed),
    keyDiscussion: clean(mapped.keyDiscussion),
    requirement: clean(mapped.requirement),
    grade: clean(mapped.grade),
    cdaStatus: clean(mapped.cdaStatus),
    samplingStatus: clean(mapped.samplingStatus),
    rdFeedback: clean(mapped.rdFeedback),
    remark,
    nextFollowUp: parseDateField(mapped.nextFollowUp),
    loaStatus: clean(mapped.loaStatus),
    application,
    applicationOther,
    city: clean(mapped.city),
    country: clean(mapped.country),
    pinCode: clean(mapped.pinCode),
    purposeOfVisit: clean(mapped.purposeOfVisit),
  }

  return { data, errors, warnings }
}

// ---------------------------------------------------------------------------
// Top-level import
// ---------------------------------------------------------------------------

export async function importLeadsFromFile(
  file: File,
  opts: LeadImportOptions = {}
): Promise<LeadImportResult> {
  const format = file.name.toLowerCase().endsWith('.csv') || file.name.toLowerCase().endsWith('.txt') ? 'csv' : 'xlsx'
  let sheet: ParsedSheet
  if (format === 'csv') {
    sheet = parseDelimited(await file.text())
  } else {
    const result = await parseSheetFile(file)
    sheet = result.sheet
  }

  const { rows, headers } = sheet
  const notes: string[] = []

  if (rows.length === 0) {
    return { created: 0, skipped: 0, rowErrors: [], warnings: [], notes: ['The file has no data rows.'], rows: [] }
  }

  const { mapping, unmappedHeaders, missingRequired } = mapLeadHeaders(headers)
  if (missingRequired.length > 0) {
    return {
      created: 0,
      skipped: 0,
      rowErrors: [],
      warnings: [],
      notes: [`Could not find a "${missingRequired.join('", "')}" column.`],
      rows: [],
    }
  }
  if (unmappedHeaders.length > 0) {
    notes.push(`Ignored columns: ${unmappedHeaders.join(', ')}.`)
  }

  const MAX_IMPORT_ROWS = 1000
  if (rows.length > MAX_IMPORT_ROWS) {
    return {
      created: 0,
      skipped: rows.length,
      rowErrors: [],
      warnings: [],
      notes: [`File has ${rows.length} rows; the limit is ${MAX_IMPORT_ROWS} per import.`],
      rows: [],
    }
  }

  const rowErrors: LeadImportRowError[] = []
  const warnings: LeadImportWarning[] = []
  const validRows: LeadImportRow[] = []
  const fileSeenEmails = new Set<string>()
  const fileSeenNameCompany = new Set<string>()

  rows.forEach((raw, index) => {
    const mapped = applyHeaderMapping(raw, mapping)
    const result = normalizeLeadRow(mapped, index + 2)
    if (!result) return

    const { data, errors: rowErrorsList, warnings: rowWarnings } = result

    if (rowErrorsList.length > 0) {
      rowErrors.push({ row: index + 2, message: rowErrorsList[0] })
      return
    }

    warnings.push(...rowWarnings)

    const emailKey = (data.email || '').toLowerCase().trim()
    const nameCompanyKey = `${(data.name || '').toLowerCase().trim()}|${(data.company || '').toLowerCase().trim()}`

    if (emailKey && opts.existingEmails?.has(emailKey)) {
      rowErrors.push({ row: index + 2, message: 'Skipped — lead with this email already exists.' })
      return
    }
    if (nameCompanyKey && opts.existingNameCompanyKeys?.has(nameCompanyKey)) {
      rowErrors.push({ row: index + 2, message: 'Skipped — lead with this name + company already exists.' })
      return
    }
    if (emailKey && fileSeenEmails.has(emailKey)) {
      rowErrors.push({ row: index + 2, message: 'Skipped — duplicate email in file.' })
      return
    }
    if (nameCompanyKey && fileSeenNameCompany.has(nameCompanyKey)) {
      rowErrors.push({ row: index + 2, message: 'Skipped — duplicate name + company in file.' })
      return
    }

    if (emailKey) fileSeenEmails.add(emailKey)
    if (nameCompanyKey) fileSeenNameCompany.add(nameCompanyKey)

    validRows.push(data)
  })

  const skipped = rowErrors.length

  return {
    created: validRows.length,
    skipped,
    rowErrors,
    warnings,
    notes,
    rows: validRows,
  }
}
