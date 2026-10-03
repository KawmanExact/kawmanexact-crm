import 'server-only'
import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary'

export function isCloudinaryConfigured(): boolean {
  return Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET)
}

export const MAX_VIDEO_SIZE = 500 * 1024 * 1024

/**
 * Public (safe-to-send-to-client) Cloudinary configuration.
 * Mirrors `configure()` so the v2 instance and env are read consistently,
 * but never exposes the API secret.
 */
export function getCloudinaryPublicConfig() {
  configure()
  return {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME!,
    apiKey: process.env.CLOUDINARY_API_KEY!,
  }
}

/**
 * Folder that Cloudinary uploads are placed under for a given org.
 * Always derived server-side from the session — never trusted from the client.
 */
export function cloudinaryOrgFolder(organizationId: string): string {
  return `kawman-exact/${organizationId}`
}

/**
 * URL prefix that all Cloudinary video delivery URLs for this account carry.
 * Used to validate signed-upload results the client sends back to us.
 */
export function cloudinaryVideoUrlPrefix(): string {
  return `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/video/upload/`
}

/**
 * Validates a Cloudinary upload result returned by the browser after a direct
 * (signed) upload. Returns an error message string, or null when valid.
 *
 * The secure_url and public_id are client-controlled at the boundary, so the
 * server must re-check them against the trusted org folder and Cloudinary
 * account before trusting them.
 */
export function validateCloudinaryVideoUpload(
  videoUrl: string,
  videoPublicId: string,
  videoBytes: number,
  organizationId: string,
): string | null {
  if (!videoUrl.startsWith(cloudinaryVideoUrlPrefix())) {
    return 'Video upload is missing or invalid'
  }
  if (!videoPublicId.startsWith(`${cloudinaryOrgFolder(organizationId)}/`)) {
    return 'Video upload is missing or invalid'
  }
  if (!Number.isFinite(videoBytes) || videoBytes <= 0 || videoBytes > MAX_VIDEO_SIZE) {
    return 'Video upload is missing or invalid'
  }
  return null
}

function configure() {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  })
}

/** Cloudinary resource_type for a given MIME type. */
export function resourceTypeForMime(mimeType: string): 'image' | 'video' | 'raw' {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('video/') || mimeType.startsWith('audio/')) return 'video'
  return 'raw'
}

export interface CloudinaryUploadResult {
  publicId: string
  resourceType: string
  secureUrl: string
  thumbnailUrl: string | null
  version: string
  fileSize: number
}

/** Uploads a file buffer to Cloudinary under an org-scoped folder. */
export async function uploadToCloudinary(
  buffer: Buffer,
  options: { organizationId: string; fileName: string; mimeType: string }
): Promise<CloudinaryUploadResult> {
  if (!isCloudinaryConfigured()) {
    throw new Error('Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.')
  }
  configure()

  const resourceType = resourceTypeForMime(options.mimeType)
  const result = await new Promise<UploadApiResponse>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: `kawman-exact/${options.organizationId}`,
        resource_type: resourceType,
        filename_override: options.fileName,
        use_filename: true,
        unique_filename: true,
      },
      (error, uploadResult) => {
        if (error) {
          reject(error)
        } else if (!uploadResult) {
          reject(new Error('Upload failed - no result'))
        } else {
          resolve(uploadResult)
        }
      }
    )
    stream.end(buffer)
  })

  const thumbnailUrl =
    resourceType === 'image'
      ? cloudinary.url(result.public_id, { transformation: [{ width: 300, height: 300, crop: 'fill' }], secure: true })
      : resourceType === 'video'
        ? cloudinary.url(result.public_id, { resource_type: 'video', format: 'jpg', secure: true })
        : null

  return {
    publicId: result.public_id,
    resourceType: result.resource_type,
    secureUrl: result.secure_url,
    thumbnailUrl,
    version: String(result.version),
    fileSize: result.bytes,
  }
}

export async function deleteFromCloudinary(publicId: string, resourceType: string): Promise<void> {
  if (!isCloudinaryConfigured()) return
  configure()
  await cloudinary.uploader.destroy(publicId, { resource_type: resourceType as 'image' | 'video' | 'raw' })
}
