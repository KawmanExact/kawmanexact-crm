import { NextResponse } from 'next/server'
import { requireApiSession } from '@/lib/session'
import { isCloudinaryConfigured, uploadToCloudinary } from '@/lib/cloudinary'
import { replaceFileContent } from '@/services/file.service'
import { checkRateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const maxDuration = 60

const MAX_SIZE_BYTES = 50 * 1024 * 1024 // 50MB

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: fileId } = await params

  let session
  try {
    session = await requireApiSession()
  } catch {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  if (!(session.user.permissions as string[]).includes('files.update')) {
    return NextResponse.json({ error: 'You do not have permission to replace files.' }, { status: 403 })
  }

  const limit = await checkRateLimit(`file-upload:${session.user.id}`, 30, 60)
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many uploads. Please slow down.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
    )
  }

  if (!isCloudinaryConfigured()) {
    return NextResponse.json(
      { error: 'Cloudinary is not configured. Ask an admin to set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.' },
      { status: 503 }
    )
  }

  const formData = await request.formData().catch(() => null)
  const file = formData?.get('file')
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: 'File exceeds the 50MB limit' }, { status: 400 })
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    const upload = await uploadToCloudinary(buffer, {
      organizationId: session.user.organizationId,
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
    })

    await replaceFileContent(fileId, {
      originalName: file.name,
      mimeType: file.type || 'application/octet-stream',
      fileSize: upload.fileSize,
      cloudinaryPublicId: upload.publicId,
      cloudinaryResourceType: upload.resourceType,
      secureUrl: upload.secureUrl,
      thumbnailUrl: upload.thumbnailUrl,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Upload failed' }, { status: 500 })
  }
}
