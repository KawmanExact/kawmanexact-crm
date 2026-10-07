import { z } from 'zod'
import { APPLICATION_OPTIONS, APPLICATION_OTHER } from './lead-dropdown-options'

/**
 * The lead-capture half of a deal. A deal IS the lead: the same enquiry fields
 * used to be collected on a `Lead` row and then copied by hand into a `Deal`.
 * Now the Deal carries all of them, so both the create and update actions —
 * and the sheet import — parse through this one schema.
 *
 * Stage, value, probability, expectedClose, priority and paymentStatus are
 * deliberately NOT here: those are the pipeline half, defined in
 * app/deals/actions.ts. Keeping the two halves in separate schemas is what
 * lets the import engine reuse the capture half verbatim.
 */
export const dealCaptureSchema = z.object({
  name: z.string().trim().min(2, 'Name is required'),
  company: z.string().trim().optional(),
  companyId: z.string().trim().optional(),
  email: z.string().trim().email('Enter a valid email').optional().or(z.literal('')),
  phone: z.string().trim().optional(),
  source: z.string().trim().optional(),
  segment: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  contactPerson: z.string().trim().optional(),
  designation: z.string().trim().optional(),
  meetingDate: z.string().trim().optional(),
  meetingAt: z.string().trim().optional(),
  meetingMode: z.string().trim().optional(),
  productsDiscussed: z.array(z.string()).optional(),
  customProductNames: z.array(z.string()).optional(),
  keyDiscussion: z.string().trim().optional(),
  requirement: z.string().trim().optional(),
  grade: z.string().trim().optional(),
  cdaStatus: z.string().trim().optional(),
  samplingStatus: z.string().trim().optional(),
  rdFeedback: z.string().trim().optional(),
  remark: z.string().trim().optional(),
  nextFollowUp: z.string().trim().optional(),
  loaStatus: z.string().trim().optional(),
  application: z.string().trim().optional(),
  applicationOther: z.string().trim().optional(),
  city: z.string().trim().optional(),
  country: z.string().trim().optional(),
  pinCode: z.string().trim().optional(),
  location: z.string().trim().optional(),
  purposeOfVisit: z.string().trim().optional(),
  score: z.coerce.number().int().min(0).max(100).optional(),
  value: z.coerce.number().min(0).optional(),
}).refine(
  (data) => {
    if (data.application === APPLICATION_OTHER && (!data.applicationOther || data.applicationOther.trim() === '')) {
      return false
    }
    return true
  },
  {
    message: 'Please specify the application',
    path: ['applicationOther'],
  },
)

export type DealCaptureInput = z.infer<typeof dealCaptureSchema>

/** Fields written as plain nullable strings; everything else needs a cast. */
export const OPTIONAL_CAPTURE_STRING_FIELDS = [
  'contactPerson',
  'designation',
  'meetingAt',
  'meetingMode',
  'keyDiscussion',
  'requirement',
  'grade',
  'cdaStatus',
  'samplingStatus',
  'rdFeedback',
  'remark',
  'loaStatus',
  'application',
  'applicationOther',
  'city',
  'country',
  'pinCode',
  'purposeOfVisit',
  'source',
] as const

const DEAL_FIELD_NAME_MAP: Record<string, string> = {
  keyDiscussion: 'keyDiscussionPoints',
  requirement: 'customerRequirement',
  rdFeedback: 'rndFeedback',
}

export function toDateOrNull(value: string | undefined): Date | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Flatten FormData into the shape the capture schema expects. Repeated and
 * array-ish inputs (`productsDiscussed`, `customProductNames`) collapse into
 * arrays, and the old `productsDiscussedCustom` alias is normalised onto
 * `customProductNames` so the sheet import and the form agree.
 */
export function parseCaptureFormData(formData: FormData): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of formData.entries()) {
    if (key.endsWith('[]') || key === 'productsDiscussed' || key === 'productsDiscussedCustom' || key === 'customProductNames') {
      const values = formData.getAll(key).filter((v) => v !== '' && v !== '[]')
      if (values.length > 0) result[key] = values
    } else if (result[key] !== undefined) {
      if (!Array.isArray(result[key])) {
        result[key] = [result[key]]
      }
      ;(result[key] as unknown[]).push(value)
    } else {
      result[key] = value
    }
  }

  if (result.productsDiscussedCustom && !result.customProductNames) {
    result.customProductNames = result.productsDiscussedCustom
  }

  return result
}

/**
 * Turn parsed capture data into the Deal columns it maps onto. Dates and
 * string arrays are cast here so the create action, the update action and the
 * importer all write the same shape rather than each hand-rolling it.
 */
export function buildDealCaptureData(data: DealCaptureInput): Record<string, unknown> {
  const createData: Record<string, unknown> = {}
  for (const field of OPTIONAL_CAPTURE_STRING_FIELDS) {
    if (field in data) {
      const dbField = DEAL_FIELD_NAME_MAP[field] ?? field
      const value = (data as Record<string, unknown>)[field]
      if (field === 'applicationOther') {
        // Only save applicationOther if application is 'Other', otherwise null
        createData[dbField] = data.application === APPLICATION_OTHER ? (value || null) : null
      } else {
        createData[dbField] = value || null
      }
    }
  }
  createData.meetingDate = toDateOrNull(data.meetingDate)
  createData.nextFollowUp = toDateOrNull(data.nextFollowUp)
  if (data.productsDiscussed && data.productsDiscussed.length > 0) {
    createData.productsDiscussed = data.productsDiscussed
  }
  if (data.customProductNames && data.customProductNames.length > 0) {
    createData.customProductNames = data.customProductNames
  }
  if (data.score !== undefined) createData.score = data.score
  return createData
}

/** Same as buildDealCaptureData, but clears empty arrays instead of omitting them. */
export function buildDealCaptureUpdateData(data: DealCaptureInput): Record<string, unknown> {
  const updateData = buildDealCaptureData(data)
  updateData.productsDiscussed = data.productsDiscussed ?? []
  updateData.customProductNames = data.customProductNames ?? []
  return updateData
}