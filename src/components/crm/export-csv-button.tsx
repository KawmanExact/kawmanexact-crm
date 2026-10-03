import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'

/** Plain anchor to a CSV export route — the browser handles the download natively via Content-Disposition, no client JS needed. */
export function ExportCsvButton({ href }: { href: string }) {
  return (
    <Button asChild variant="ghost" size="sm" className="gap-1.5">
      <a href={href} download>
        <Download className="h-3.5 w-3.5" />
        Export CSV
      </a>
    </Button>
  )
}
