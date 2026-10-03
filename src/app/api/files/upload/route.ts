import { NextResponse } from 'next/server'
import { requireApiSession } from '@/lib/session'
import { isCloudinaryConfigured, uploadToCloudinary } from '@/lib/cloudinary'
import { createFileRecord } from '@/services/file.service'
import { checkRateLimit } from '@/lib/rate-limit'
import type { FileVisibility } from '@/types/files'

export const runtime = 'nodejs'
export const maxDuration = 60

const MAX_SIZE_BYTES = 50 * 1024 * 1024 // 50MB

// Allowed MIME types for file uploads — never include executable content
// types (text/html, text/javascript, text/css, application/xml) that
// could be served as stored XSS via Cloudinary secure_url.
const ALLOWED_MIME_TYPES = new Set([
  // Images
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/bmp',
  'image/tiff',
  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'text/markdown',
  // Archives
  'application/zip',
  'application/x-zip-compressed',
  'application/x-rar-compressed',
  'application/x-7z-compressed',
  'application/gzip',
  // Video
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-matroska',
  // Audio
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  'audio/mp4',
  'audio/webm',
  // Code — JSON only (no html/js/css/xml — stored XSS)
  'application/json',
  'application/typescript',
])

export async function POST(request: Request) {
  let session
  try {
    session = await requireApiSession()
  } catch {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  if (!(session.user.permissions as string[]).includes('files.upload')) {
    return NextResponse.json({ error: 'You do not have permission to upload files.' }, { status: 403 })
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

  // Validate MIME type — file.type is client-controlled, so we reject
  // anything not on the allowlist and rely on Cloudinary resource_type
  // (image/video/raw) as a second layer; for images we also verify
  // magic bytes to catch spoofed MIME types.
  const mimeType = file.type || 'application/octet-stream'
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    return NextResponse.json(
      { error: `File type "${mimeType}" is not allowed. Allowed types: images, documents, archives, video, audio, and code files.` },
      { status: 400 }
    )
  }

  // Extra guard: block filename extensions that imply executable content
  // even if the MIME was spoofed as an allowed type.
  const lowerName = file.name.toLowerCase()
  if (/\.(html?|js|css|xml|svg)$/.test(lowerName) && mimeType !== 'image/svg+xml') {
    return NextResponse.json({ error: 'That file extension is not allowed.' }, { status: 400 })
  }

  // Magic-byte check for images (catch MIME spoofing). SVG is XML text, skip it.
  if (mimeType.startsWith('image/') && mimeType !== 'image/svg+xml') {
    const header = new Uint8Array(await file.slice(0, 12).arrayBuffer())
    const sig = {
      'image/jpeg': header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff,
      'image/png': header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47,
      'image/gif': header[0] === 0x47 && header[1] === 0x49 && header[2] === 0x46,
      'image/webp': header[8] === 0x57 && header[9] === 0x45 && header[10] === 0x42 && header[11] === 0x50,
      'image/bmp': header[0] === 0x42 && header[1] === 0x4d,
      'image/tiff': (header[0] === 0x49 && header[1] === 0x49) || (header[0] === 0x4d && header[1] === 0x4d),
    } as Record<string, boolean>
    if (sig[mimeType] === false) {
      return NextResponse.json({ error: `File content does not match declared type ${mimeType}.` }, { status: 400 })
    }
  }

  const folderId = (formData?.get('folderId') as string) || null
  const visibility = ((formData?.get('visibility') as string) || 'PRIVATE') as FileVisibility

  try {
    // Sanitize filename for logging/storage (prevent log injection via CRLF)
    const safeName = file.name.replace(/[\r\n]/g, '')
    const buffer = Buffer.from(await file.arrayBuffer())

    const upload = await uploadToCloudinary(buffer, {
      organizationId: session.user.organizationId,
      fileName: safeName,
      mimeType: file.type || 'application/octet-stream',
    })

    const fileId = await createFileRecord({
      fileName: safeName,
      originalName: safeName,
      mimeType: file.type || 'application/octet-stream',
      fileSize: upload.fileSize,
      cloudinaryPublicId: upload.publicId,
      cloudinaryResourceType: upload.resourceType,
      secureUrl: upload.secureUrl,
      thumbnailUrl: upload.thumbnailUrl,
      version: upload.version,
      folderId: folderId || null,
      visibility,
    })

    return NextResponse.json({ id: fileId })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Upload failed' }, { status: 500 })
  }
}
