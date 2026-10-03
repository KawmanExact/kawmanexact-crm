import { MainLayout } from '@/components/layout'
import { DashboardPageSkeleton } from '@/components/skeletons'

export default function Loading() {
  return (
    <MainLayout>
      <DashboardPageSkeleton />
    </MainLayout>
  )
}
