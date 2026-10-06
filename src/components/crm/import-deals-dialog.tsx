'use client'

import { Upload, X, AlertTriangle, CheckCircle2, FileSpreadsheet, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { SHEET_ACCEPTED_EXTENSIONS } from '@/lib/sheet-import'
import {
  downloadDealsCsvTemplate,
  downloadDealsXlsxTemplate,
  useDealsImport,
} from './use-deals-import'

export function ImportDealsDialog({ onClose }: { onClose: () => void }) {
  const { inputRef, pending, result, fileName, handleFile } = useDealsImport()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl border border-white/10 bg-[#0a111c] p-5 shadow-xl max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-white font-semibold flex items-center gap-2">
            <Upload className="h-4 w-4 text-purple-400" />
            Import deals from Excel or CSV
          </h3>
          <button onClick={onClose} className="text-white/40 hover:text-white" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-xs text-white/40 mb-4">
          Every row becomes a deal. Only <span className="text-white/60">Name</span> is required —
          other columns are matched flexibly (e.g. &ldquo;Customer Name&rdquo;, &ldquo;Contact Person&rdquo;,
          &ldquo;Products Discussed&rdquo;, &ldquo;CDA Status / date&rdquo;, &ldquo;Next Follow-up&rdquo;).
          Rows land at <span className="text-white/60">SUSPECT</span> unless a Status column maps
          them to a later stage. Unrecognised columns are ignored and reported.
        </p>

        <div className="mb-4 flex gap-2">
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
            // Clear the input so re-picking the same file after a fix still fires.
            e.target.value = ''
          }}
        />
        <Button className="w-full gap-1.5" disabled={pending} onClick={() => inputRef.current?.click()}>
          <Upload className="h-3.5 w-3.5" />
          {pending ? 'Importing…' : fileName ? `Re-select file (${fileName})` : 'Choose .xlsx or .csv file'}
        </Button>
        <p className="mt-2 text-[11px] text-white/30">
          The legacy .xls format is not supported — save as .xlsx or .csv.
        </p>

        {result && <ImportResultPanel result={result} />}
      </div>
    </div>
  )
}

function ImportResultPanel({ result }: { result: NonNullable<ReturnType<typeof useDealsImport>['result']> }) {
  return (
    <Card className="mt-4 bg-white/[0.02] border-white/[0.06] p-3 space-y-2">
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
  )
}