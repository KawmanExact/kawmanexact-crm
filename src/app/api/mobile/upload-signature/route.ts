import { NextResponse } from 'next/server'
import { v2 as cloudinary } from 'cloudinary'
import { mobileGuard } from '@/lib/mobile-api'
import { isCloudinaryConfigured, getCloudinaryPublicConfig, cloudinaryOrgFolder } from '@/lib/cloudinary'

/**
 * Signed params so the phone uploads photos DIRECTLY to Cloudinary. This keeps
 * images out of the Vercel function body (the 413 you hit on /meetings/new).
 */
export async function POST() {
  const g = await mobileGuard('field_visits.update', { key: 'mobile-sign', max: 30, windowSec: 60 })
  if ('error' in g) return g.error
  if (!isCloudinaryConfigured()) {
    return NextResponse.json({ error: 'File uploads are not configured.' }, { status: 503 })
  }
  const cfg = getCloudinaryPublicConfig()
  const timestamp = Math.round(Date.now() / 1000)
  const folder = cloudinaryOrgFolder(g.session.user.organizationId)
  const signature = cloudinary.utils.api_sign_request({ timestamp, folder }, process.env.CLOUDINARY_API_SECRET!)
  return NextResponse.json({ timestamp, folder, signature, apiKey: cfg.apiKey, cloudName: cfg.cloudName })
}
