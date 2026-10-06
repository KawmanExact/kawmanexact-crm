// CRM domain types. Mirror prisma/schema.prisma enums/fields so the
// eventual Prisma query results can be mapped into these shapes with
// minimal translation. See src/services/{lead,company,contact,deal}.service.ts.

export type LeadStatus = 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'PROPOSAL' | 'NEGOTIATION' | 'WON' | 'LOST'

export type Segment = 'NUTRACEUTICAL' | 'PHARMACEUTICAL' | 'COSMETICS' | 'FUNCTIONAL' | 'OTHER'

export const SEGMENTS: Segment[] = ['NUTRACEUTICAL', 'PHARMACEUTICAL', 'COSMETICS', 'FUNCTIONAL', 'OTHER']

export const SEGMENT_LABEL: Record<Segment, string> = {
  NUTRACEUTICAL: 'Nutraceutical',
  PHARMACEUTICAL: 'Pharmaceutical',
  COSMETICS: 'Cosmetics',
  FUNCTIONAL: 'Functional',
  OTHER: 'Other',
}

export interface Lead {
  id: string
  name: string
  company: string
  email: string
  phone: string
  source: string
  owner: string
  ownerInitials: string
  ownerId: string
  status: LeadStatus
  segment: string | null
  createdAt: string
  lastActivityAt: string
  notes: string | null
  contactPerson: string | null
  designation: string | null
  meetingDate: string | null
  meetingAt: string | null
  productsDiscussed: string[]
  customProductNames: string[]
  keyDiscussion: string | null
  requirement: string | null
  grade: string | null
  cdaStatus: string | null
  samplingStatus: string | null
  rdFeedback: string | null
  remark: string | null
  nextFollowUp: string | null
  loaStatus: string | null
  location: string | null
  region: string | null
  purposeOfVisit: string | null
}

export interface Company {
  id: string
  name: string
  industry: string
  website: string
  phone: string
  email: string
  city: string
  state: string
  employees: number
  revenue: number
  owner: string
  ownerInitials: string
  status: 'ACTIVE' | 'INACTIVE'
  createdAt: string
}

export interface Contact {
  id: string
  name: string
  company: string
  designation: string
  email: string
   phone: string
   mobile: string
   address: string
   owner: string
   ownerInitials: string
   status: 'ACTIVE' | 'INACTIVE'
   segment: string | null
   lastActivityAt: string
}

export type DealStage = 'SUSPECT' | 'PROSPECT' | 'APPROACH_ANALYSE' | 'NEGOTIATE' | 'CLOSE' | 'ORDER' | 'PAYMENT' | 'LOST'
export type DealPriority = 'LOW' | 'MEDIUM' | 'HIGH'

export interface Deal {
  id: string
  name: string
  company: string
  contact: string
  value: number
  probability: number
  stage: DealStage
  owner: string
  ownerInitials: string
  expectedClose: string
  priority: DealPriority
  paymentStatus?: string
  /** Enquiry detail, merged in from the old lead form — a deal IS the lead. */
  email: string
  phone: string
  source: string
  contactPerson: string | null
  designation: string | null
  city: string | null
  country: string | null
  pinCode: string | null
  cdaStatus: string | null
  samplingStatus: string | null
  grade: string | null
  application: string | null
  applicationOther: string | null
  loaStatus: string | null
  nextFollowUp: string | null
  purposeOfVisit: string | null
  keyDiscussion: string | null
  requirement: string | null
  meetingAt: string | null
  meetingMode: string | null
  rdFeedback: string | null
  remark: string | null
  productsDiscussed: string[]
  customProductNames: string[]
  createdAt: string
  lastActivityAt: string
}
