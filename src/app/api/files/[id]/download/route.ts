import { NextResponse } from 'next/server'
import { requireApiSession } from '@/lib/session'
import { canAccessFile } from '@/services/file.service'
import { checkRateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: fileId } = await params

  let session
  try {
    session = await requireApiSession()
  } catch {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const limit = await checkRateLimit(`file-download:${session.user.id}`, 100, 60)
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many downloads. Please slow down.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
    )
  }

  const file = await canAccessFile(fileId, session.user.id, session.user.organizationId)
  if (!file) {
    return NextResponse.json({ error: 'File not found or access denied' }, { status: 404 })
  }

  const isPreview = new URL(request.url).searchParams.get('preview') === '1'

  if (isPreview && file.mimeType.startsWith('image/')) {
    return NextResponse.json({ url: file.secureUrl })
  }

  return NextResponse.redirect(file.secureUrl, 302)
}
