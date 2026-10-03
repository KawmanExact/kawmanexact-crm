import { requirePermission } from '@/lib/session'
import ReportsClient from './reports-client'

export const metadata = { title: 'Daily Reports | Kawman ExAct' }

export default async function MyTeamReportsPage() {
  await requirePermission('team.view_all')
  return <ReportsClient />
}
