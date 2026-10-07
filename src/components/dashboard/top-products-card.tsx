'use client'

import type { ProductSalesMetric } from '@/types/dashboard'

interface TopProductsCardProps {
  items: ProductSalesMetric[]
}

export function TopProductsCard({ items }: TopProductsCardProps) {
  if (!items?.length) return null

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
      <h3 className="text-sm font-medium text-white/70 mb-3">Top Products This Month</h3>
      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 rounded-lg bg-white/[0.03]">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-medium text-purple-300">{item.name.charAt(0).toUpperCase()}</span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-white truncate line-clamp-2" title={item.name}>{item.name}</p>
                <p className="text-xs text-white/40 truncate">{item.quantity} {item.unit}</p>
              </div>
            </div>
            <div className="flex flex-col sm:items-end gap-1 text-right shrink-0 whitespace-nowrap">
              <p className="text-sm font-semibold text-emerald-300">{item.salesValue}</p>
              <p className="text-xs text-amber-300/80">Pending: {item.pendingAmount}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}