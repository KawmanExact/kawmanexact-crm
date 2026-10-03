'use server'

import { validateCsrf } from '@/lib/csrf'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireApiSession } from '@/lib/session'
import { PERMISSIONS } from '@/lib/permissions-data'
import {
  createFolder,
  deleteFolder,
  toggleStar,
  trashFile,
  restoreFile,
  permanentlyDeleteFile,
  updateFileVisibility,
  shareFile,
  createCategory,
  deleteCategory,
  getFolderAccessGrants,
  grantFolderAccess,
  revokeFolderAccess,
  getFileVersions,
  restoreFileVersion,
} from '@/services/file.service'
import type { FileVisibility, FilePermissionLevel } from '@/types/files'

async function assertPermission(permission: string) {
  const session = await requireApiSession()
  if (!(session.user.permissions as string[]).includes(permission)) throw new Error('You do not have permission to do this.')
  return session
}

export interface SimpleActionState {
  error?: string
  success?: boolean
}

// ============================================================
// Folders
// ============================================================

export async function createFolderAction(name: string, parentId: string | null): Promise<SimpleActionState> {
  try {
    await validateCsrf()
    await assertPermission(PERMISSIONS['files.upload'].name)
    if (!name.trim()) return { error: 'Folder name is required' }
    await createFolder(name.trim(), parentId)
    revalidatePath('/files/my-files')
    revalidatePath('/files/folders')
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to create folder' }
  }
}

export async function deleteFolderAction(id: string): Promise<void> {
  await validateCsrf()
  await assertPermission(PERMISSIONS['files.delete'].name)
  await deleteFolder(id)
  revalidatePath('/files/my-files')
  revalidatePath('/files/folders')
}

// ============================================================
// Folder access grants
// ============================================================

export interface FolderAccessActionState {
  error?: string
}

export async function listFolderAccessAction(folderId: string) {
  await validateCsrf()
  return getFolderAccessGrants(folderId)
}

export async function grantFolderAccessAction(
  folderId: string,
  userId: string,
  level: FilePermissionLevel
): Promise<FolderAccessActionState> {
  try {
    await validateCsrf()
    await assertPermission(PERMISSIONS['files.share'].name)
    await grantFolderAccess(folderId, userId, level)
    revalidatePath('/files/my-files')
    revalidatePath('/files/folders')
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to grant access' }
  }
}

export async function revokeFolderAccessAction(grantId: string): Promise<void> {
  await validateCsrf()
  await assertPermission(PERMISSIONS['files.share'].name)
  await revokeFolderAccess(grantId)
  revalidatePath('/files/my-files')
  revalidatePath('/files/folders')
}

// ============================================================
// File versioning
// ============================================================

export async function listFileVersionsAction(fileId: string) {
  await validateCsrf()
  await assertPermission(PERMISSIONS['files.view'].name)
  return getFileVersions(fileId)
}

export async function restoreFileVersionAction(fileId: string, versionId: string): Promise<SimpleActionState> {
  try {
    await validateCsrf()
    await assertPermission(PERMISSIONS['files.update'].name)
    await restoreFileVersion(fileId, versionId)
    revalidatePath('/files/my-files')
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to restore version' }
  }
}

// ============================================================
// Star / trash
// ============================================================

export async function toggleStarAction(fileId: string, star: boolean): Promise<void> {
  await validateCsrf()
  await assertPermission(PERMISSIONS['files.view'].name)
  await toggleStar(fileId, star)
  revalidatePath('/files/my-files')
  revalidatePath('/files/starred')
  revalidatePath('/files/recent')
}

export async function trashFileAction(fileId: string): Promise<void> {
  await validateCsrf()
  await assertPermission(PERMISSIONS['files.delete'].name)
  await trashFile(fileId)
  revalidatePath('/files/my-files')
  revalidatePath('/files/trash')
  revalidatePath('/files/recent')
  revalidatePath('/files/starred')
}

export async function restoreFileAction(fileId: string): Promise<void> {
  await validateCsrf()
  await assertPermission(PERMISSIONS['files.delete'].name)
  await restoreFile(fileId)
  revalidatePath('/files/my-files')
  revalidatePath('/files/trash')
}

export async function permanentlyDeleteFileAction(fileId: string): Promise<void> {
  await validateCsrf()
  await assertPermission(PERMISSIONS['files.delete'].name)
  await permanentlyDeleteFile(fileId)
  revalidatePath('/files/trash')
}

// ============================================================
// Visibility & sharing
// ============================================================

export async function updateFileVisibilityAction(fileId: string, visibility: FileVisibility): Promise<void> {
  await validateCsrf()
  await assertPermission(PERMISSIONS['files.manage'].name)
  await updateFileVisibility(fileId, visibility)
  revalidatePath('/files/my-files')
}

const shareSchema = z.object({
  sharedWithId: z.string().trim().min(1, 'Choose a person to share with'),
  level: z.enum(['VIEWER', 'EDITOR', 'MANAGER']),
})

export async function shareFileAction(fileId: string, formData: FormData): Promise<SimpleActionState> {
  try {
    await validateCsrf()
    await assertPermission(PERMISSIONS['files.share'].name)
    const parsed = shareSchema.safeParse(Object.fromEntries(formData))
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
    await shareFile(fileId, parsed.data.sharedWithId, parsed.data.level as FilePermissionLevel)
    revalidatePath('/files/shared')
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to share file' }
  }
}

// ============================================================
// Categories
// ============================================================

const categorySchema = z.object({
  name: z.string().trim().min(2, 'Name is required'),
  description: z.string().trim().optional(),
  color: z.string().trim().optional(),
})

export interface CategoryFormState {
  error?: string
  fieldErrors?: Record<string, string>
  success?: boolean
}

export async function createCategoryAction(_prev: CategoryFormState, formData: FormData): Promise<CategoryFormState> {
  await validateCsrf()
  await assertPermission(PERMISSIONS['files.manage'].name)
  const parsed = categorySchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] = issue.message
    return { fieldErrors }
  }
  await createCategory(parsed.data)
  revalidatePath('/files/categories')
  return { success: true }
}

export async function deleteCategoryAction(id: string): Promise<void> {
  await validateCsrf()
  await assertPermission(PERMISSIONS['files.manage'].name)
  await deleteCategory(id)
  revalidatePath('/files/categories')
}
