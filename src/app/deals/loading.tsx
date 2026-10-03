import { MainLayout } from '@/components/layout'
import { KanbanPageSkeleton } from '@/components/skeletons'

export default function Loading() {
  return (
    <MainLayout>
      <KanbanPageSkeleton />
    </MainLayout>
  )
}
