import { NextResponse } from 'next/server'
import { requireApiSession } from '@/lib/session'
import { checkRateLimit } from '@/lib/rate-limit'
import { extractDocument, AI_UPLOAD_MAX_BYTES, AI_UPLOAD_ALLOWED, extractedToPromptSnippet } from '@/lib/ai-extract'
import { inferCharts } from '@/lib/ai-charts'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: Request) {
  let session
  try {
    session = await requireApiSession()
  } catch {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const limit = await checkRateLimit(`ai-upload:${session.user.id}`, 20, 60)
  if (!limit.allowed) {
    return NextResponse.json({ error: 'Too many uploads. Slow down.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } })
  }

  const form = await request.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })

  const files = form.getAll('files').filter((v): v is File => v instanceof File)
  if (!files.length) {
    return NextResponse.json({ error: 'No files provided. Send files as `files`.' }, { status: 400 })
  }
  if (files.length > 3) {
    return NextResponse.json({ error: 'Upload up to 3 files at a time.' }, { status: 400 })
  }

  const results: Array<{
    name: string
    mimeType: string
    size: number
    kind: string
    snippet: string
    truncated: boolean
    pages?: number
    sheetName?: string
    totalRows?: number
    charts?: ReturnType<typeof inferCharts>
    // image vision payload — sent back so the chat panel can forward it to /api/ai/chat
    imageBase64?: string
  }> = []

  for (const file of files) {
    if (file.size > AI_UPLOAD_MAX_BYTES) {
      return NextResponse.json({ error: `${file.name} exceeds ${AI_UPLOAD_MAX_BYTES / 1024 / 1024}MB limit.` }, { status: 400 })
    }
    const mime = (file.type || '').toLowerCase()
    const name = file.name || 'upload'
    const isAllowed =
      AI_UPLOAD_ALLOWED.has(mime) ||
      /\.(xlsx|xls|csv)$/i.test(name) ||
      mime.startsWith('image/')
    if (!isAllowed) {
      return NextResponse.json({ error: `${name} (${mime || 'unknown type'}) is not supported. Allowed: PDF, images, Excel (.xlsx/.xls), CSV.` }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    try {
      const doc = await extractDocument(file, buffer)
      const snippet = extractedToPromptSnippet(doc, name)

      if (doc.kind === 'image') {
        results.push({
          name, mimeType: mime, size: file.size,
          kind: 'image',
          snippet,
          truncated: false,
          imageBase64: doc.base64,
        })
      } else if (doc.kind === 'sheet') {
        const charts = inferCharts(doc.headers, doc.rows, doc.sheetName)
        results.push({
          name, mimeType: mime, size: file.size,
          kind: 'sheet',
          snippet,
          truncated: doc.truncated,
          sheetName: doc.sheetName,
          totalRows: doc.totalRows,
          charts,
        })
      } else if (doc.kind === 'pdf') {
        results.push({
          name, mimeType: mime, size: file.size,
          kind: 'pdf',
          snippet,
          truncated: doc.truncated,
          pages: doc.pages,
        })
      } else {
        results.push({
          name, mimeType: mime, size: file.size,
          kind: 'text',
          snippet,
          truncated: doc.truncated,
        })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to extract file'
      return NextResponse.json({ error: `${name}: ${msg}` }, { status: 400 })
    }
  }

  return NextResponse.json({ files: results })
}
