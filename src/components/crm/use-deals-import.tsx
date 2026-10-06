'use client'

import { useCallback, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { importDealsAction, type DealImportResult } from '@/app/deals/actions'

/**
 * Sheet template columns. The same file that used to import leads now imports
 * deals, so these headers are unchanged on purpose — existing spreadsheets keep
 * working. Two columns are new and optional: `value` (deal value) and `stage`
 * (the pipeline stage; blank or unrecognised enters at SUSPECT).
 */
export const DEALS_TEMPLATE_COLUMNS = [
  'name',
  'company',
  'contactPerson',
  'designation',
  'email',
  'phone',
  'source',
  'grade',
  'status',
  'stage',
  'segment',
  'value',
  'score',
  'meetingDate',
  'meetingAt',
  'productsDiscussed',
  'keyDiscussion',
  'requirement',
  'cdaStatus',
  'samplingStatus',
  'rdFeedback',
  'remark',
  'nextFollowUp',
  'loaStatus',
  'location',
  'region',
  'purposeOfVisit',
  'notes',
  'ownerEmail',
] as const

export const DEALS_TEMPLATE_ROW = {
  name: 'Jane Doe',
  company: 'Acme Corp',
  contactPerson: 'John Smith',
  designation: 'Purchase Manager',
  email: 'jane@acme.com',
  phone: '+91 98765 43210',
  source: 'Referral',
  grade: 'Pharmaceutical',
  status: 'NEW',
  stage: 'SUSPECT',
  segment: 'NUTRACEUTICAL',
  value: 250000,
  score: 50,
  meetingDate: '01-Oct-2026',
  meetingAt: 'Mumbai Office',
  productsDiscussed: 'ArginExAct, CoQExAct',
  keyDiscussion: 'Interested in bulk pricing',
  requirement: 'Need samples within 2 weeks',
  cdaStatus: 'Pending',
  samplingStatus: 'Sent',
  rdFeedback: 'Positive',
  remark: 'Contact No.: 9326886243',
  nextFollowUp: '05-Oct-2026',
  loaStatus: 'Pending',
  location: 'Mumbai',
  region: 'West',
  purposeOfVisit: 'New product demo',
  notes: 'Interested in bulk pricing',
  ownerEmail: '',
}

/**
 * Generate a real .xlsx template in the browser. Excel users will edit a
 * spreadsheet, and .xlsx is Excel's default format, so a CSV-only template made
 * them re-save the file before they could start. Built with exceljs, imported
 * lazily so it never lands in the initial bundle.
 */
export async function downloadDealsXlsxTemplate(): Promise<void> {
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Deals')
  sheet.columns = DEALS_TEMPLATE_COLUMNS.map((header) => ({ header, key: header, width: 22 }))
  sheet.addRow(DEALS_TEMPLATE_ROW)
  sheet.getRow(1).font = { bold: true }

  const buffer = await workbook.xlsx.writeBuffer()
  triggerDownload(
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    'deals-import-template.xlsx'
  )
}

export function downloadDealsCsvTemplate(): void {
  const header = DEALS_TEMPLATE_COLUMNS.join(',')
  const row = DEALS_TEMPLATE_COLUMNS.map((column) => DEALS_TEMPLATE_ROW[column]).join(',')
  triggerDownload(
    new Blob([`${header}\r\n${row}\r\n`], { type: 'text/csv;charset=utf-8' }),
    'deals-import-template.csv'
  )
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

/**
 * Shared upload plumbing for the import dialog and the /deals/import page.
 * Both used to carry their own copy of this, which is how the CSV-only wording
 * drifted apart from the action that accepts .xlsx.
 */
export function useDealsImport() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<DealImportResult | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)

  const handleFile = useCallback(
    (files: FileList | null) => {
      const file = files?.[0]
      if (!file) return
      setFileName(file.name)
      setResult(null)
      const formData = new FormData()
      formData.append('file', file)
      startTransition(async () => {
        const response = await importDealsAction(formData)
        setResult(response)
        if (response.created > 0) router.refresh()
      })
    },
    [router]
  )

  return { inputRef, pending, result, fileName, handleFile }
}