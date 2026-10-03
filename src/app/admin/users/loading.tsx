import { MainLayout } from '@/components/layout'
import { TablePageSkeleton } from '@/components/skeletons'

export default function Loading() {
  return (
    <MainLayout>
      <TablePageSkeleton />
    </MainLayout>
  )
}
