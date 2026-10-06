import { getStageLabel } from '@/lib/deal-pipeline'

export interface DealExportColumn {
  key: keyof DealExportRow
  header: string
  group: string
  width: number
  wrap?: boolean
  type: 'text' | 'number' | 'date' | 'link'
  accessor: (row: DealExportRow) => unknown
}

export interface DealExportRow {
  no: number
  date: string | null
  customerName: string
  city: string
  country: string
  pincode: string
  contactPerson: string | null
  contactNumber: string
  designation: string | null
  email: string
  leadSource: string
  purposeOfVisit: string | null
  meetingAt: string | null
  productsDiscussed: string
  keyDiscussionPoints: string | null
  customerRequirement: string | null
  grade: string | null
  application: string | null
  status: string
  cdaStatus: string | null
  samplingStatus: string | null
  rndFeedback: string | null
  remark: string | null
  nextFollowUp: string | null
  loa: string | null
}

const EMPTY = ''

export const DEAL_EXPORT_COLUMNS: DealExportColumn[] = [
  {
    key: 'no',
    header: 'No',
    group: 'Basic Info',
    width: 6,
    type: 'number',
    accessor: (r) => r.no,
  },
  {
    key: 'date',
    header: 'Date',
    group: 'Basic Info',
    width: 14,
    wrap: true,
    type: 'date',
    accessor: (r) => r.date,
  },
  {
    key: 'customerName',
    header: 'Customer Name',
    group: 'Basic Info',
    width: 24,
    wrap: true,
    type: 'text',
    accessor: (r) => r.customerName,
  },
  {
    key: 'city',
    header: 'City',
    group: 'Location',
    width: 16,
    wrap: true,
    type: 'text',
    accessor: (r) => r.city,
  },
  {
    key: 'country',
    header: 'Country',
    group: 'Location',
    width: 14,
    wrap: true,
    type: 'text',
    accessor: (r) => r.country,
  },
  {
    key: 'pincode',
    header: 'Pincode',
    group: 'Location',
    width: 12,
    type: 'text',
    accessor: (r) => r.pincode,
  },
  {
    key: 'contactPerson',
    header: 'Contact Person',
    group: 'Contact',
    width: 18,
    wrap: true,
    type: 'text',
    accessor: (r) => r.contactPerson,
  },
  {
    key: 'contactNumber',
    header: 'Contact Number',
    group: 'Contact',
    width: 18,
    type: 'text',
    accessor: (r) => r.contactNumber,
  },
  {
    key: 'designation',
    header: 'Designation',
    group: 'Contact',
    width: 16,
    wrap: true,
    type: 'text',
    accessor: (r) => r.designation,
  },
  {
    key: 'email',
    header: 'Email',
    group: 'Contact',
    width: 26,
    type: 'link',
    accessor: (r) => r.email,
  },
  {
    key: 'leadSource',
    header: 'Lead source',
    group: 'Meeting Details',
    width: 16,
    wrap: true,
    type: 'text',
    accessor: (r) => r.leadSource,
  },
  {
    key: 'purposeOfVisit',
    header: 'Purpose of Visit',
    group: 'Meeting Details',
    width: 24,
    wrap: true,
    type: 'text',
    accessor: (r) => r.purposeOfVisit,
  },
  {
    key: 'meetingAt',
    header: 'Meeting at',
    group: 'Meeting Details',
    width: 14,
    wrap: true,
    type: 'text',
    accessor: (r) => r.meetingAt,
  },
  {
    key: 'productsDiscussed',
    header: 'Products Discussed',
    group: 'Product & Requirement',
    width: 28,
    wrap: true,
    type: 'text',
    accessor: (r) => r.productsDiscussed,
  },
  {
    key: 'keyDiscussionPoints',
    header: 'Key Discussion Points',
    group: 'Product & Requirement',
    width: 28,
    wrap: true,
    type: 'text',
    accessor: (r) => r.keyDiscussionPoints,
  },
  {
    key: 'customerRequirement',
    header: 'Customer Requirement',
    group: 'Product & Requirement',
    width: 28,
    wrap: true,
    type: 'text',
    accessor: (r) => r.customerRequirement,
  },
  {
    key: 'grade',
    header: 'Grade',
    group: 'Product & Requirement',
    width: 14,
    wrap: true,
    type: 'text',
    accessor: (r) => r.grade,
  },
  {
    key: 'application',
    header: 'Application',
    group: 'Product & Requirement',
    width: 24,
    wrap: true,
    type: 'text',
    accessor: (r) => r.application,
  },
  {
    key: 'status',
    header: 'Status',
    group: 'Pipeline Status',
    width: 16,
    wrap: true,
    type: 'text',
    accessor: (r) => r.status,
  },
  {
    key: 'cdaStatus',
    header: 'CDA Status / date',
    group: 'Pipeline Status',
    width: 18,
    wrap: true,
    type: 'text',
    accessor: (r) => r.cdaStatus,
  },
  {
    key: 'samplingStatus',
    header: 'Sampling Status',
    group: 'Pipeline Status',
    width: 16,
    wrap: true,
    type: 'text',
    accessor: (r) => r.samplingStatus,
  },
  {
    key: 'rndFeedback',
    header: 'Feedback From R&D Team',
    group: 'Pipeline Status',
    width: 20,
    wrap: true,
    type: 'text',
    accessor: (r) => r.rndFeedback,
  },
  {
    key: 'remark',
    header: 'Remark',
    group: 'Follow-up',
    width: 24,
    wrap: true,
    type: 'text',
    accessor: (r) => r.remark,
  },
  {
    key: 'nextFollowUp',
    header: 'Next Follow-up',
    group: 'Follow-up',
    width: 14,
    wrap: true,
    type: 'date',
    accessor: (r) => r.nextFollowUp,
  },
  {
    key: 'loa',
    header: 'LOA',
    group: 'Follow-up',
    width: 14,
    wrap: true,
    type: 'text',
    accessor: (r) => r.loa,
  },
]

export function toExportRow(deal: Record<string, unknown>, index: number): DealExportRow {
  const companyName = typeof deal.company === 'object' && deal.company ? (deal.company as any).name : (deal.company as string) || ''
  const contactName = typeof deal.contact === 'object' && deal.contact ? (deal.contact as any).name : (deal.contactPerson as string) || ''
  const contactPhone = typeof deal.contact === 'object' && deal.contact ? (deal.contact as any).phone : (deal.phone as string) || ''
  const customerName = companyName || (deal.name as string) || EMPTY
  const contactNumber = contactPhone || (deal.phone as string) || EMPTY

  const stageLabel = typeof deal.stage === 'string' ? getStageLabel(deal.stage as any) : ''

  const products = [
    ...((deal.productsDiscussed as string[] | undefined) ?? []),
    ...((deal.customProductNames as string[] | undefined) ?? []),
  ]
    .filter(Boolean)
    .join(', ')

  return {
    no: index + 1,
    date: formatDateOrText(deal.meetingDate as string | null | undefined),
    customerName,
    city: (deal.city as string) || EMPTY,
    country: (deal.country as string) || EMPTY,
    pincode: (deal.pinCode as string) || EMPTY,
    contactPerson: contactName || null,
    contactNumber,
    designation: (deal.designation as string) || null,
    email: (deal.email as string) || EMPTY,
    leadSource: (deal.source as string) || EMPTY,
    purposeOfVisit: (deal.purposeOfVisit as string) || null,
    meetingAt: (deal.meetingAt as string) || null,
    productsDiscussed: products,
    keyDiscussionPoints: (deal.keyDiscussionPoints as string) || null,
    customerRequirement: (deal.customerRequirement as string) || null,
    grade: (deal.grade as string) || null,
    application: (deal.application as string) || null,
    status: stageLabel,
    cdaStatus: (deal.cdaStatus as string) || null,
    samplingStatus: (deal.samplingStatus as string) || null,
    rndFeedback: (deal.rndFeedback as string) || null,
    remark: (deal.remark as string) || null,
    nextFollowUp: formatDateOrText(deal.nextFollowUp as string | null | undefined),
    loa: (deal.loaStatus as string) || null,
  }
}

function formatDateOrText(value: string | null | undefined): string | null {
  if (!value) return null
  // If it looks like a real ISO date, format it. Otherwise keep the raw text.
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    const d = new Date(value)
    if (!Number.isNaN(d.getTime())) {
      const day = String(d.getDate()).padStart(2, '0')
      const month = d.toLocaleString('en-US', { month: 'short' })
      const year = d.getFullYear()
      return `${day}-${month}-${year}`
    }
  }
  return value
}

export const STATUS_COLORS: Record<string, string> = {
  'Open': 'FFD1FAE3',
  'Contact Only': 'FFDBEAFE',
  'Closed': 'FFE5E7EB',
  'Follow-up Required': 'FFFFF3CD',
  'Technical Follow-up': 'FFFFF3CD',
  'Pending': 'FFFFF3CD',
}

export function getStatusColor(status: string): string | undefined {
  return STATUS_COLORS[status] || STATUS_COLORS[getStageLabel(status as any)] || undefined
}
