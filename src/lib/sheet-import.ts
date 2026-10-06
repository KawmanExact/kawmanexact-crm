/**
 * One parser for BOTH CSV and real spreadsheet files, so the lead importer does
 * not care which format the user actually has.
 *
 * Why this exists: `parseCSV` in lib/csv.ts only understands delimited text.
 * A user who exports the sales sheet as .xlsx — which is what Excel produces by
 * default — cannot import it. This module reads a real workbook with exceljs and
 * reduces it to the same `Record<string, string>` shape parseCSV already returns,
 * so downstream validation, mapping and error reporting are shared verbatim.
 *
 * No `server-only` marker: the column-mapping helpers are pure and unit tested.
 * exceljs itself is imported lazily inside the parse function so a client bundle
 * never pulls it in.
 */
import { parseCSV } from '@/lib/csv'
import type ExcelJS from 'exceljs'

export interface ParsedSheet {
  headers: string[]
  rows: Record<string, string>[]
  /** Which sheet the data came from. */
  sheetName: string
  /** Every sheet name in the workbook, so a wrong choice is recoverable. */
  availableSheets: string[]
}

export type SheetFileFormat = 'csv' | 'xlsx'

/** Extensions accepted by the importer, mapped to the parser that handles them. */
export const SHEET_ACCEPTED_EXTENSIONS = ['.csv', '.xlsx', '.xlsm'] as const

export function sheetFormatForFile(file: { name: string }): SheetFileFormat | null {
  const lower = file.name.toLowerCase()
  if (lower.endsWith('.csv') || lower.endsWith('.txt')) return 'csv'
  // .xls (the pre-2007 binary format) is NOT supported: exceljs cannot read it
  // and silently parsing it would produce zero rows. Callers must say so.
  if (lower.endsWith('.xlsx') || lower.endsWith('.xlsm')) return 'xlsx'
  return null
}

/**
 * Flatten one spreadsheet cell to text.
 *
 * Excel stores a number as a number, a date as a serial number and a
 * "percent-formatted" cell as a fraction. `cell.text` gives the DISPLAYED value,
 * which is what the user sees in Excel and therefore what they expect to be
 * imported — a date cell reads as the date they typed, and "50%" reads as "50%".
 * Formula cells keep their computed result.
 */
function cellText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === 'object') {
    const rich = value as { richText?: Array<{ text: string }>; text?: string; result?: unknown; hyperlink?: string }
    if (Array.isArray(rich.richText)) return rich.richText.map((part) => part.text).join('')
    if (rich.text !== undefined) return String(rich.text)
    // A formula cell: use the cached result, and fall back to the formula text
    // so a cell Excel has not recalculated is still visible.
    if (rich.result !== undefined) return cellText(rich.result)
    return ''
  }
  return String(value).trim()
}

/** Normalised, alias-matching view of a header row, used to score candidates. */
function headerScore(cells: string[]): number {
  let score = 0
  for (const cell of cells) {
    const normalized = normalizeHeader(cell)
    if (!normalized) continue
    for (const aliases of Object.values(LEAD_IMPORT_HEADER_ALIASES)) {
      if (aliases.some((alias) => normalizeHeader(alias) === normalized)) {
        score += 2
        break
      }
    }
  }
  // A header row is mostly non-empty text, so break a tie toward that.
  return score + cells.filter((cell) => cell !== '').length / 10
}

/**
 * Read the most lead-like worksheet of an .xlsx buffer into header-keyed rows.
 *
 * Header detection scans for the row that best matches our known column names
 * rather than assuming row 1. Excel exports routinely carry a title or a
 * "generated on <date>" line above the real header, and just as routinely put
 * cover/instructions sheets before the data.
 */
export async function parseSpreadsheet(
  buffer: ArrayBuffer,
  requestedSheet?: string
): Promise<ParsedSheet> {
  const { default: xlsxLib } = await import('exceljs')
  const workbook = new xlsxLib.Workbook()
  await workbook.xlsx.load(buffer)

  const availableSheets = workbook.worksheets.map((sheet) => sheet.name)
  if (availableSheets.length === 0) {
    return { headers: [], rows: [], sheetName: '', availableSheets: [] }
  }

  const toGrid = (sheet: ExcelJS.Worksheet): string[][] => {
    const grid: string[][] = []
    sheet.eachRow({ includeEmpty: false }, (row: ExcelJS.Row) => {
      const cells: string[] = []
      const columnCount = Math.max(row.cellCount, row.actualCellCount)
      for (let i = 1; i <= columnCount; i += 1) {
        cells.push(cellText(row.getCell(i).value))
      }
      grid.push(cells)
    })
    return grid
  }

  const emptyResult = (sheetName: string): ParsedSheet => ({
    headers: [],
    rows: [],
    sheetName,
    availableSheets,
  })

  const explicit = requestedSheet ? workbook.getWorksheet(requestedSheet) : undefined
  if (explicit) {
    const grid = toGrid(explicit)
    return buildSheet(grid, explicit.name, emptyResult(explicit.name))
  }

  // Choose the sheet whose header row best matches our column names. Ties fall
  // back to workbook order, so a plain single-sheet file behaves as before.
  const candidates = workbook.worksheets
    .map((sheet) => ({ sheet, grid: toGrid(sheet) }))
    .filter((candidate) => candidate.grid.length > 0)

  if (candidates.length === 0) {
    return emptyResult(workbook.worksheets[0].name)
  }

  let best = candidates[0]
  let bestScore = -1
  for (const candidate of candidates) {
    const headerRow = candidate.grid.find((cells) => cells.some((cell) => cell !== ''))
    const score = headerRow ? headerScore(headerRow) : 0
    if (score > bestScore) {
      best = candidate
      bestScore = score
    }
  }

  return buildSheet(best.grid, best.sheet.name, emptyResult(best.sheet.name))
}

/** Locate the header row in a grid and key every data row by its headers. */
function buildSheet(grid: string[][], sheetName: string, emptyResult: ParsedSheet): ParsedSheet {
  let headerIndex = -1
  let headerScoreBest = -1
  grid.forEach((cells, index) => {
    if (!cells.some((cell) => cell !== '')) return
    const score = headerScore(cells)
    if (score > headerScoreBest) {
      headerScoreBest = score
      headerIndex = index
    }
  })
  if (headerIndex === -1) return emptyResult

  const headers = grid[headerIndex].map((header) => header.trim())
  const rows: Record<string, string>[] = []

  for (let i = headerIndex + 1; i < grid.length; i += 1) {
    const cells = grid[i]
    // Skip a blank spacer row rather than reporting it as an invalid lead.
    if (cells.every((cell) => cell === '')) continue
    const row: Record<string, string> = {}
    headers.forEach((header, columnIndex) => {
      if (header) row[header] = cells[columnIndex] ?? ''
    })
    rows.push(row)
  }

  return { headers: headers.filter(Boolean), rows, sheetName, availableSheets: emptyResult.availableSheets }
}

/** Read delimited text through the shared CSV parser. */
export function parseDelimited(text: string): ParsedSheet {
  const parsed = parseCSV(text)
  return { ...parsed, sheetName: 'CSV', availableSheets: ['CSV'] }
}

/**
 * Parse whichever format the file actually is. Returns the detected format so
 * the caller can report it back to the user.
 */
export async function parseSheetFile(
  file: File,
  requestedSheet?: string
): Promise<{ format: SheetFileFormat; sheet: ParsedSheet }> {
  const format = sheetFormatForFile(file)
  if (format === null) {
    throw new Error(
      'Unsupported file type. Save the sheet as .xlsx (Excel) or .csv and try again. The legacy .xls format is not supported.'
    )
  }
  if (format === 'csv') {
    return { format, sheet: parseDelimited(await file.text()) }
  }
  return { format, sheet: await parseSpreadsheet(await file.arrayBuffer(), requestedSheet) }
}

// ============================================================
// Header mapping
// ============================================================

/**
 * Match a spreadsheet header to one of our field names, ignoring case, spacing
 * and punctuation. A sheet exported by someone else is called "Company Name",
 * "company_name" or "COMPANY" — all three are the same field.
 */
export function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim()
}

/** Everything the importer accepts for each lead field, best match first. */
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
  funnelStage: ['funnelstage', 'spancop', 'spancopstage', 'funnel', 'pipeline', 'pipelinestage'],
  lastActivityAt: ['lastactivity', 'lastactivityat', 'lastcontacted', 'lastcontact', 'lastfollowedup', 'lastactivitydate'],
}

/**
 * Build the header -> field map for one sheet and report which required columns
 * are missing, so the user is told exactly what to rename rather than getting a
 * wall of "invalid row" errors.
 */
export function mapLeadHeaders(
  headers: string[]
): { mapping: Record<string, string>; matched: string[]; unmappedHeaders: string[]; missingRequired: string[] } {
  const normalized = headers.map(normalizeHeader)
  const mapping: Record<string, string> = {}
  const matchedHeaders = new Set<string>()

  // Two passes: an exact normalized match wins over a prefix/contains match, so
  // "Name" does not get claimed by the "company" alias list first.
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
    missingRequired: Object.values(mapping).includes('name') ? [] : ['name'],
  }
}

/** Rename a sheet row's keys into lead field names using a header mapping. */
export function applyHeaderMapping(
  row: Record<string, string>,
  mapping: Record<string, string>
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [header, value] of Object.entries(row)) {
    const field = mapping[header]
    if (!field) continue
    // First column wins if two headers mapped to the same field.
    if (out[field] !== undefined && out[field] !== '') continue
    out[field] = value ?? ''
  }
  return out
}

/**
 * Parse a date a user typed into a cell.
 *
 * Explicit patterns are handled first rather than left to `new Date(string)`,
 * whose behaviour is implementation-defined: Node reads "01-Mar-2026" as
 * 28 Feb and the day/month order of "01/03/2026" is engine-dependent. Day-first
 * is used for slash dates, matching the en-GB formatting used everywhere else in
 * this app.
 *
 * Returns null for blank or unparseable input rather than an Invalid Date, so a
 * bad cell falls back to "now" instead of poisoning lastActivityAt.
 */
export function normalizeImportDate(raw: string | null | undefined): Date | null {
  const value = (raw ?? '').trim()
  if (value === '') return null

  // ISO, and the d/m/yyyy day-first form.
  const numeric = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(value)
  if (numeric) {
    return buildDate(Number(numeric[1]), Number(numeric[2]), Number(numeric[3]))
  }
  const dayFirst = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(value)
  if (dayFirst) {
    return buildDate(Number(dayFirst[3]), Number(dayFirst[2]), Number(dayFirst[1]))
  }
  // "01-Mar-2026"
  const named = /^(\d{1,2})[-\s]([A-Za-z]{3,})[-\s](\d{4})$/.exec(value)
  if (named) {
    const month = MONTH_NAMES.indexOf(named[2].slice(0, 3).toLowerCase())
    if (month !== -1) return buildDate(Number(named[3]), month + 1, Number(named[1]))
    return null
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const MONTH_NAMES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** UTC date, or null for an impossible day/month so "2026-02-31" is not rolled over. */
function buildDate(year: number, month: number, day: number): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const date = new Date(Date.UTC(year, month - 1, day))
  // Reject a rolled-over date such as 31 February, which JS would turn into
  // 03 March and silently import the wrong date.
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return date
}