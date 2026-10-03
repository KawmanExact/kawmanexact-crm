import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { v2 as cloudinary } from 'cloudinary'
import { auth } from '@/lib/auth'
import { isCloudinaryConfigured, getCloudinaryPublicConfig, cloudinaryOrgFolder } from '@/lib/cloudinary'
import { checkRateLimit } from '@/lib/rate-limit'

export async function POST(request: NextRequest) {
  void request

  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const permissions = session.user.permissions as string[]
  if (!permissions.includes('meetings.create') && !permissions.includes('meetings.update')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const limit = await checkRateLimit(`meeting-sign:${session.user.id}`, 10, 60)
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please slow down.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
    )
  }

  if (!isCloudinaryConfigured()) {
    return NextResponse.json({ error: 'File uploads are not configured.' }, { status: 503 })
  }

  const config = getCloudinaryPublicConfig()
  const timestamp = Math.round(Date.now() / 1000)
  const folder = cloudinaryOrgFolder(session.user.organizationId)

  // Sign the upload params. The API secret is used only here on the server
  // and is never returned to the client.
  const signature = cloudinary.utils.api_sign_request(
    { timestamp, folder },
    process.env.CLOUDINARY_API_SECRET!
  )

  return NextResponse.json({
    timestamp,
    folder,
    signature,
    apiKey: config.apiKey,
    cloudName: config.cloudName,
  })
}
