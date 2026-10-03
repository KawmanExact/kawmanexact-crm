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
  status: LeadStatus
  score: number
  value: number
  segment: string | null
  createdAt: string
  lastActivityAt: string
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

export type DealStage = 'NEW_LEAD' | 'CONTACTED' | 'QUALIFIED' | 'PROPOSAL' | 'NEGOTIATION' | 'WON' | 'LOST'
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
  segment: string | null
}
