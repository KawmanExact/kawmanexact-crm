import Link from 'next/link'
import { ChevronRight, Home } from 'lucide-react'

export function FileBreadcrumb({ path }: { path: { id: string; name: string }[] }) {
  return (
    <div className="flex items-center gap-1.5 text-sm text-white/50 flex-wrap">
      <Link href="/files/my-files" className="flex items-center gap-1 hover:text-white transition-colors">
        <Home className="h-3.5 w-3.5" />
        My Files
      </Link>
      {path.map((p, i) => (
        <span key={p.id} className="flex items-center gap-1.5">
          <ChevronRight className="h-3.5 w-3.5 text-white/25" />
          {i === path.length - 1 ? (
            <span className="text-white">{p.name}</span>
          ) : (
            <Link href={`/files/my-files?folder=${p.id}`} className="hover:text-white transition-colors">
              {p.name}
            </Link>
          )}
        </span>
      ))}
    </div>
  )
}
