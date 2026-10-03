// Types for the enterprise dashboard. These mirror the shape that
// getDashboardMetrics() (src/services/dashboard.service.ts) returns.
// When wiring to Prisma/Neon, keep this contract stable so the UI
// components never need to change - only the service implementation.

export type TrendDirection = 'up' | 'down'

export interface KpiMetric {
  id: string
  label: string
  value: string
  rawValue: number
  trendLabel: string
  trendDirection: TrendDirection
  sparkline: number[]
  icon: 'leads' | 'deals' | 'visits' | 'followups' | 'won'
}

export interface PipelineStage {
  id: string
  name: string
  count: number
  value: string
  color: string
}

export interface AIInsight {
  id: string
  icon: 'flame' | 'clock' | 'trend' | 'meeting'
  title: string
  description: string
}

export interface FieldActivityMetric {
  id: string
  label: string
  value: number
  sublabel: string
  icon: 'checkin' | 'meeting' | 'geo' | 'mom'
  color: 'green' | 'purple' | 'blue' | 'orange'
}

export interface LiveVisitMarker {
  id: string
  name: string
  status: 'In Meeting' | 'Checked-in' | 'On the way' | 'Checked-out'
  latitude: number
  longitude: number
}

export interface LeadSource {
  id: string
  name: string
  count: number
  percentage: number
  color: string
}

export interface FollowUp {
  id: string
  company: string
  purpose: string
  dateLabel: string
  timeLabel: string
  assigneeInitials: string
  assigneeName: string
}

export interface RecentActivity {
  id: string
  icon: 'checkin' | 'meeting' | 'mom' | 'lead' | 'deal'
  color: 'green' | 'purple' | 'orange' | 'blue' | 'pink'
  description: string
  timeLabel: string
}

export interface DashboardMetrics {
  userName: string
  kpis: KpiMetric[]
  pipeline: PipelineStage[]
  conversionRate: string
  conversionTrend: string
  aiSummary: { title: string; description: string }
  aiInsights: AIInsight[]
  fieldActivity: FieldActivityMetric[]
  liveVisits: LiveVisitMarker[]
  leadSources: LeadSource[]
  totalLeads: number
  upcomingFollowUps: FollowUp[]
  recentActivities: RecentActivity[]
  storage: { usedGb: number; totalGb: number }
}
