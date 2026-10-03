import { MainLayout } from '@/components/layout'
import { DetailPageSkeleton } from '@/components/skeletons'

export default function Loading() {
  return (
    <MainLayout>
      <DetailPageSkeleton panels={0} />
    </MainLayout>
  )
}
