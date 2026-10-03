'use server'

import { validateCsrf } from '@/lib/csrf'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/db'
import { requireApiSession } from '@/lib/session'
import { isCloudinaryConfigured, uploadToCloudinary } from '@/lib/cloudinary'

const profileSchema = z.object({
  name: z.string().trim().min(2, 'Name is required'),
  phone: z.string().trim().optional(),
  designation: z.string().trim().optional(),
})

const MAX_AVATAR_BYTES = 5 * 1024 * 1024 // 5MB
const ALLOWED_AVATAR_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp'])

export interface ProfileFormState {
  error?: string
  fieldErrors?: Record<string, string>
  success?: boolean
}

/** Updates the CURRENT user's own profile only — there is deliberately no userId parameter, so this can never be used to edit someone else's account. */
export async function updateOwnProfileAction(_prev: ProfileFormState, formData: FormData): Promise<ProfileFormState> {
  await validateCsrf()
  const session = await requireApiSession()

  // ---- avatar handling (file upload, not a URL) ----
  let newImage: string | null | undefined = undefined // undefined = keep existing
  const avatarRemoved = formData.get('avatarRemoved') === '1'
  if (avatarRemoved) newImage = null

  const rawFile = formData.get('avatarFile')
  const avatarFile = rawFile instanceof File && rawFile.size > 0 ? rawFile : null
  if (avatarFile) {
    if (!ALLOWED_AVATAR_TYPES.has(avatarFile.type)) {
      return { fieldErrors: { image: 'Use JPG, PNG, WEBP or GIF.' } }
    }
    if (avatarFile.size > MAX_AVATAR_BYTES) {
      return { fieldErrors: { image: 'Image must be under 5MB.' } }
    }
    if (!isCloudinaryConfigured()) {
      return { error: 'Image storage is not configured. Ask an admin to set CLOUDINARY_* env vars.' }
    }
    try {
      const safeName = avatarFile.name.replace(/[\r\n]/g, '').slice(0, 80) || 'avatar'
      const buffer = Buffer.from(await avatarFile.arrayBuffer())
      const upload = await uploadToCloudinary(buffer, {
        organizationId: session.user.organizationId,
        fileName: `avatar-${session.user.id}-${Date.now()}-${safeName}`,
        mimeType: avatarFile.type,
      })
      newImage = upload.secureUrl
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Avatar upload failed.' }
    }
  }

  // Validate text fields (FormData may contain File entries — only pass strings to zod)
  const parsed = profileSchema.safeParse({
    name: String(formData.get('name') ?? ''),
    phone: String(formData.get('phone') ?? ''),
    designation: String(formData.get('designation') ?? ''),
  })
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] = issue.message
    return { fieldErrors }
  }
  const data = parsed.data

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      name: data.name,
      phone: data.phone || null,
      designation: data.designation || null,
      ...(newImage !== undefined ? { image: newImage } : {}),
    },
  })

  revalidatePath('/settings/profile')
  revalidatePath('/')
  return { success: true }
}
