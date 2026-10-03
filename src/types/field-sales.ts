// Field Sales domain types. Mirror prisma/schema.prisma (FieldVisit,
// CheckIn, GeoFence, VisitReport) so query results map cleanly.

export type VisitStatus = 'SCHEDULED' | 'ON_THE_WAY' | 'CHECKED_IN' | 'IN_MEETING' | 'COMPLETED' | 'CANCELLED'

export interface FieldVisit {
  id: string
  title: string
  purpose: string
  scheduledAt: string
  status: VisitStatus
  latitude: number | null
  longitude: number | null
  address: string | null
  assignee: string
  assigneeInitials: string
  assigneeId: string
  company: string | null
  companyId: string | null
  contact: string | null
  deal: string | null
  createdAt: string
  completedAt: string | null
  lastCheckIn: {
    verificationStatus: string
    distanceFromCustomer: number | null
    photoUrl: string | null
    createdAt: string
  } | null
}

export interface CheckIn {
  id: string
  visitId: string
  visitTitle: string
  companyName: string | null
  user: string
  userInitials: string
  latitude: number
  longitude: number
  accuracy: number | null
  distanceFromCustomer: number | null
  verificationStatus: string
  photoUrl: string | null
  notes: string | null
  createdAt: string
}

/** @deprecated Geo-fencing is retired — kept for backwards compat only */
export interface GeoFence {
  id: string
  name: string
  latitude: number
  longitude: number
  radius: number
  companyId: string | null
  companyName: string | null
  isActive: boolean
  createdAt: string
}

export interface VisitReport {
  id: string
  visitId: string
  visitTitle: string
  companyName: string | null
  createdBy: string
  purpose: string
  discussion: string | null
  requirements: string | null
  competitorInfo: string | null
  customerFeedback: string | null
  nextSteps: string | null
  createdAt: string
}

export interface LiveMapVisit {
  id: string
  title: string
  status: VisitStatus
  assignee: string
  assigneeInitials: string
  latitude: number
  longitude: number
  companyName: string | null
  address: string | null
}

export interface ActiveUserPin {
  id: string
  name: string
  initials: string
  latitude: number
  longitude: number
  lastSeenAt: string
  lastCheckInAt: string | null
  companyName: string | null
  visitTitle: string | null
  /** Live-tracking fields (from UserLiveLocation) — null when only check-in location is available */
  accuracy: number | null
  heading: number | null
  speed: number | null
  updatedAt: string | null
  isTracking: boolean
  isStale: boolean
}

export interface LiveMapData {
  visits: LiveMapVisit[]
  activeUsers: ActiveUserPin[]
}
