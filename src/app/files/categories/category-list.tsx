'use client'

import { useTransition } from 'react'
import { Tag, Trash2 } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { deleteCategoryAction } from '../actions'
import type { FileCategoryItem } from '@/types/files'

export function CategoryList({ categories }: { categories: FileCategoryItem[] }) {
  const [pending, startTransition] = useTransition()

  if (categories.length === 0) {
    return (
      <Card className="bg-[#0a111c]/80 border-white/[0.08] py-12 text-center">
        <Tag className="h-6 w-6 text-white/30 mx-auto mb-2" />
        <p className="text-white/40 text-sm">No categories yet</p>
      </Card>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {categories.map((c) => (
        <Card key={c.id} className="bg-[#0a111c]/80 border-white/[0.08] p-4 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <span
              className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
              style={{ backgroundColor: `${c.color ?? '#a78bfa'}22`, color: c.color ?? '#a78bfa' }}
            >
              <Tag className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-white font-medium truncate">{c.name}</p>
              {c.description && <p className="text-white/40 text-xs mt-0.5">{c.description}</p>}
            </div>
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(() => deleteCategoryAction(c.id))}
            className="text-white/25 hover:text-red-400 transition-colors shrink-0"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </Card>
      ))}
    </div>
  )
}
