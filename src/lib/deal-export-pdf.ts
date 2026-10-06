import { jsPDF } from 'jspdf'
import { applyPlugin, autoTable } from 'jspdf-autotable'
import { DEAL_EXPORT_COLUMNS, type DealExportRow } from './deal-export-columns'

applyPlugin(jsPDF)

export function buildDealExportPdf(input: {
  rows: DealExportRow[]
  organizationName: string
  generatedBy: string
  generatedAt: Date
  filters: string[]
  truncated?: { shown: number; total: number }
}): Buffer {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a3' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 28

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text('Deals Export', margin, margin + 8)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(input.organizationName || 'Organization', margin, margin + 24)
  doc.text(
    `Generated: ${input.generatedAt.toLocaleDateString('en-IN')} ${input.generatedAt.toLocaleTimeString('en-IN')} by ${input.generatedBy || '—'}`,
    pageWidth - margin,
    margin + 24,
    { align: 'right' }
  )

  let cursor = margin + 48
  if (input.filters.length > 0) {
    doc.setFontSize(8)
    doc.text(`Filters: ${input.filters.join('  |  ')}`, margin, cursor, { maxWidth: pageWidth - margin * 2 })
    cursor += 16
  }
  if (input.truncated) {
    doc.setFontSize(8)
    doc.setTextColor(180)
    doc.text(
      `TRUNCATED: showing the first ${input.truncated.shown} of ${input.truncated.total} matching rows.`,
      margin,
      cursor
    )
    doc.setTextColor(0)
    cursor += 16
  }

  const head = [DEAL_EXPORT_COLUMNS.map((c) => c.header)]
  const body = input.rows.map((row) =>
    DEAL_EXPORT_COLUMNS.map((col) => {
      const raw = col.accessor(row)
      if (raw === null || raw === undefined) return ''
      if (col.key === 'date' || col.key === 'nextFollowUp') {
        const str = String(raw)
        if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
          const d = new Date(str)
          if (!Number.isNaN(d.getTime())) {
            const day = String(d.getDate()).padStart(2, '0')
            const month = d.toLocaleString('en-US', { month: 'short' })
            const year = d.getFullYear()
            const hours = String(d.getHours()).padStart(2, '0')
            const mins = String(d.getMinutes()).padStart(2, '0')
            return `${day}-${month}-${year} ${hours}:${mins}`
          }
        }
        return str
      }
      if (col.key === 'no') return String(raw)
      return String(raw)
    })
  )

  autoTable(doc, {
    startY: cursor,
    head,
    body,
    margin: { left: margin, right: margin, top: margin, bottom: 40 },
    styles: { fontSize: 7.5, cellPadding: 3, overflow: 'linebreak', cellWidth: 'wrap', valign: 'middle' },
    headStyles: { fillColor: [15, 29, 58], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: buildColumnStyles(),
    didDrawPage: (hook) => {
      const pageCount = doc.getNumberOfPages()
      doc.setFontSize(7)
      doc.setTextColor(110)
      doc.text(
        `Page ${hook.pageNumber} of ${pageCount}`,
        pageWidth - margin,
        doc.internal.pageSize.getHeight() - margin + 16,
        { align: 'right' }
      )
      doc.setTextColor(0)
    },
  })

  const buffer = doc.output('arraybuffer')
  return Buffer.from(buffer)
}

function buildColumnStyles(): Record<number, any> {
  const styles: Record<number, any> = {}
  DEAL_EXPORT_COLUMNS.forEach((col, i) => {
    if (col.type === 'number') {
      styles[i] = { halign: 'right' }
    } else if (col.type === 'link') {
      styles[i] = { halign: 'left' }
    } else {
      styles[i] = { halign: 'left' }
    }
    if (col.wrap) {
      styles[i].cellWidth = 'wrap'
    }
  })
  return styles
}
