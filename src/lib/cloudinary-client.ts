/**
 * Browser-safe Cloudinary direct (signed) upload helper.
 *
 * Why this exists: Vercel's Edge/Server Action runtime enforces a hard 4.5MB
 * request-body limit, so uploading large meeting videos *through* our server
 * triggers a 413. Instead the browser mints a short-lived upload signature from
 * /api/cloudinary/sign and uploads the video straight to Cloudinary in 20MB
 * chunks, then sends only the resulting URL/metadata to the server.
 *
 * This module intentionally imports nothing server-only so it can be used from
 * 'use client' components.
 */

export interface CloudinaryUploadResult {
  public_id: string
  secure_url: string
  bytes: number
}

const CHUNK_SIZE = 20 * 1024 * 1024 // 20 MB — Cloudinary's documented max chunk

export async function uploadVideoDirect(
  file: File,
  onProgress?: (loaded: number, total: number) => void
): Promise<CloudinaryUploadResult> {
  const signRes = await fetch('/api/cloudinary/sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })

  if (!signRes.ok) {
    let message = `Failed to sign upload (${signRes.status})`
    try {
      const body = await signRes.json().catch(() => null)
      if (body?.error?.message) message = body.error.message
    } catch {
      // ignore parse errors; keep the default message
    }
    throw new Error(message)
  }

  const { timestamp, folder, signature, apiKey, cloudName } = (await signRes.json()) as {
    timestamp: number
    folder: string
    signature: string
    apiKey: string
    cloudName: string
  }

  const uploadUrl = `https://api.cloudinary.com/v1_1/${cloudName}/video/upload`
  const total = file.size
  const totalChunks = Math.ceil(total / CHUNK_SIZE)
  const uniqueUploadId = crypto.randomUUID()

  return new Promise<CloudinaryUploadResult>((resolve, reject) => {
    let chunkIndex = 0
    let uploadedBytes = 0
    let lastPublicId: string | null = null

    const sendChunk = () => {
      if (totalChunks === 0 || chunkIndex >= totalChunks) {
        reject(new Error('Upload completed but no data was returned'))
        return
      }

      const start = chunkIndex * CHUNK_SIZE
      const end = Math.min(start + CHUNK_SIZE, total)
      const isLastChunk = chunkIndex === totalChunks - 1
      const chunk = file.slice(start, end)

      const form = new FormData()
      form.append('file', chunk, file.name)
      form.append('api_key', apiKey)
      form.append('timestamp', String(timestamp))
      form.append('signature', signature)
      form.append('folder', folder)

      const xhr = new XMLHttpRequest()

      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable && onProgress) {
          onProgress(uploadedBytes + event.loaded, total)
        }
      })

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          let resp: Record<string, unknown>
          try {
            resp = JSON.parse(xhr.responseText)
          } catch {
            reject(new Error('Upload failed: invalid server response'))
            return
          }

          if (resp.error && typeof resp.error === 'object' && typeof (resp.error as { message?: string }).message === 'string') {
            reject(new Error((resp.error as { message: string }).message))
            return
          }

          if (typeof resp.public_id === 'string') {
            lastPublicId = resp.public_id
          }

          uploadedBytes = end
          chunkIndex++

          if (isLastChunk) {
            const secureUrl = typeof resp.secure_url === 'string' && resp.secure_url
              ? (resp.secure_url as string)
              : null
            const bytes = typeof resp.bytes === 'number' ? resp.bytes : uploadedBytes
            if (!secureUrl) {
              reject(new Error('Upload completed but no secure_url was returned'))
              return
            }
            if (!lastPublicId) {
              reject(new Error('Upload completed but no public_id was returned'))
              return
            }
            resolve({ public_id: lastPublicId, secure_url: secureUrl, bytes })
          } else {
            sendChunk()
          }
        } else {
          let message = `Upload failed with status ${xhr.status}`
          try {
            const body = JSON.parse(xhr.responseText)
            if (body?.error?.message) message = body.error.message
          } catch {
            // keep default message
          }
          reject(new Error(message))
        }
      })

      xhr.addEventListener('error', () => reject(new Error('Network error during upload')))
      xhr.addEventListener('abort', () => reject(new Error('Upload aborted')))
      xhr.addEventListener('timeout', () => reject(new Error('Upload timed out')))

      xhr.open('POST', uploadUrl)
      xhr.setRequestHeader('X-Unique-Upload-Id', uniqueUploadId)
      xhr.setRequestHeader('Content-Range', `bytes ${start}-${end - 1}/${total}`)
      xhr.send(form)
    }

    sendChunk()
  })
}
