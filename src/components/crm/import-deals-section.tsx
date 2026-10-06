'use client'

import { Upload, AlertTriangle, CheckCircle2, FileSpreadsheet, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { SHEET_ACCEPTED_EXTENSIONS } from '@/lib/sheet-import'
import {
  downloadDealsCsvTemplate,
  downloadDealsXlsxTemplate,
  useDealsImport,
} from './use-deals-import'

export function ImportDealsSection() {
  const { inputRef, pending, result, fileName, handleFile } = useDealsImport()

  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-6 space-y-4">
      <p className="text-sm text-white/60">
        Upload an <span className="text-white/90">.xlsx</span> or{' '}
        <span className="text-white/90">.csv</span> file. Only{' '}
        <code className="text-white/90">Name</code> is required; every other column is matched by
        name, so <code className="text-white/70">Customer Name</code>,{' '}
        <code className="text-white/70">Contact Person</code>,{' '}
        <code className="text-white/70">Products Discussed</code>,{' '}
        <code className="text-white/70">CDA Status / date</code> and{' '}
        <code className="text-white/70">Next Follow-up</code> are all recognised. Rows land at{' '}
        <code className="text-white/70">SUSPECT</code> unless a Status column maps them to a later
        stage. Up to 1,000 rows per file.
      </p>

      <div className="flex gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="flex-1 gap-1.5"
          onClick={() => void downloadDealsXlsxTemplate()}
        >
          <FileSpreadsheet className="h-3.5 w-3.5" />
          .xlsx template
        </Button>
        <Button variant="ghost" size="sm" className="flex-1 gap-1.5" onClick={downloadDealsCsvTemplate}>
          <Download className="h-3.5 w-3.5" />
          .csv template
        </Button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={SHEET_ACCEPTED_EXTENSIONS.join(',')}
        className="hidden"
        onChange={(e) => {
          handleFile(e.target.files)
          e.target.value = ''
        }}
      />
      <Button className="w-full gap-1.5" disabled={pending} onClick={() => inputRef.current?.click()}>
        <Upload className="h-3.5 w-3.5" />
        {pending ? 'Importing…' : fileName ? `Re-select file (${fileName})` : 'Choose .xlsx or .csv file'}
      </Button>
      <p className="text-[11px] text-white/30">
        The legacy .xls format is not supported — save as .xlsx or .csv.
      </p>

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
                Imported {result.created} deal{result.created === 1 ? '' : 's'}
                {result.skipped > 0 ? `, skipped ${result.skipped}` : ''}.
              </p>
              {result.warnings.length > 0 && (
                <ul className="text-xs text-amber-300/80 space-y-1">
                  {result.warnings.map((w, i) => (
                    <li key={i}>Row {w.row}: {w.message}</li>
                  ))}
                </ul>
              )}
              {result.notes.length > 0 && (
                <ul className="text-xs text-white/45 space-y-1">
                  {result.notes.map((note, i) => (
                    <li key={i}>{note}</li>
                  ))}
                </ul>
              )}
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