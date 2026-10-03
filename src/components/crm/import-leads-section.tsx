'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, Download, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { importLeadsAction, type LeadImportResult } from '@/app/leads/actions'

const TEMPLATE_CSV =
  'name,company,email,phone,source,segment,status,score,value,notes\r\n' +
  'Jane Doe,Acme Corp,jane@acme.com,+91 98765 43210,Referral,NUTRACEUTICAL,NEW,50,250000,Interested in bulk pricing\r\n'

function downloadTemplate() {
  const blob = new Blob([TEMPLATE_CSV], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'leads-import-template.csv'
  a.click()
  URL.revokeObjectURL(url)
}

export function ImportLeadsSection() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<LeadImportResult | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)

  function handleFile(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    setFileName(file.name)
    setResult(null)
    const formData = new FormData()
    formData.append('file', file)
    startTransition(async () => {
      const res = await importLeadsAction(formData)
      setResult(res)
      if (res.created > 0) router.refresh()
    })
  }

  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-6 space-y-4">
      <p className="text-sm text-white/60">
         Upload a CSV with columns: <code className="text-white/90">name</code> (required), company, email, phone, source,
         segment, status, score, value, notes. Up to 1,000 rows per file.
      </p>
      <Button variant="ghost" size="sm" className="w-full gap-1.5" onClick={downloadTemplate}>
        <Download className="h-3.5 w-3.5" />
        Download template
      </Button>
      <input ref={inputRef} type="file" accept=".csv" className="hidden" onChange={(e) => handleFile(e.target.files)} />
      <Button className="w-full gap-1.5" disabled={pending} onClick={() => inputRef.current?.click()}>
        <Upload className="h-3.5 w-3.5" />
        {pending ? 'Importing…' : fileName ? `Re-select file (${fileName})` : 'Choose CSV file'}
      </Button>
      {result && (
        <Card className="bg-white/[0.02] border-white/[0.06] p-3 space-y-2">
          {result.error ? (
            <p className="text-sm text-red-400 flex items-start gap-1.5">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              {result.error}
            </p>
          ) : (
            <>
              <p className="text-sm text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4" />
                Imported {result.created} lead{result.created === 1 ? '' : 's'}
                {result.skipped > 0 ? `, skipped ${result.skipped}` : ''}.
              </p>
              {result.rowErrors.length > 0 && (
                <ul className="text-xs text-white/50 space-y-1 max-h-32 overflow-y-auto">
                  {result.rowErrors.map((e, i) => (
                    <li key={i}>
                      Row {e.row}: {e.message}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </Card>
      )}
    </div>
  )
}
