import 'server-only'
import { prisma } from '@/lib/db'
import { requireApiSession } from '@/lib/session'
import { deleteFromCloudinary, resourceTypeForMime } from '@/lib/cloudinary'
import type { FileItem, FolderItem, FileCategoryItem, SharedFileItem, FileVisibility, FilePermissionLevel } from '@/types/files'
import type { Prisma } from '@/generated/prisma'
import type { Session } from '@/lib/auth'

function initials(name: string): string {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
}

async function logActivity(fileId: string, userId: string, action: string, metadata?: Record<string, unknown>) {
  await prisma.fileActivity.create({
    data: { fileId, userId, action, metadata: (metadata ?? undefined) as Prisma.InputJsonValue | undefined },
  })
}

// ============================================================
// Folder-level access control (audit: "Folder permissions —
// Folders exist with parentId, no folder-level permissions/sharing").
//
// Uses the FilePermission model, which already existed in the schema
// with a folderId column but had zero application code reading or
// writing it. Semantics are private-by-default — a folder with NO
// grants is visible ONLY to its creator. Even users with files.manage
// (Admin / Super Admin) must have an explicit FilePermission grant
// or be the creator to access a folder.
//
//   - The folder's creator always has access.
//   - A folder with zero FilePermission rows is private to its creator.
//   - Any folder becomes visible to a user only if they are the
//     creator or have an explicit FilePermission grant on that folder.
//   - Only user-level grants are wired up below. The schema also supports
//     team- and department-level grants (FilePermission.teamId /
//     .departmentId) for exactly this purpose — extending
//     canAccessFolder()/grantFolderAccess() to check the caller's team and
//     department is the natural next step, left out here since the session
//     object doesn't currently carry teamId/departmentId (see lib/session.ts)
//     and adding that lookup deserved its own review rather than being
//     folded in silently.
// ============================================================

async function canAccessFolder(
  folderId: string,
  userId: string,
  organizationId: string
): Promise<boolean> {
  const folder = await prisma.folder.findFirst({
    where: { id: folderId, organizationId },
    select: { createdById: true },
  })
  if (!folder) return false
  if (folder.createdById === userId) return true

  // Folders are private by default — even admins must have an explicit
  // FilePermission grant or be the creator to access a folder.
  const ownGrant = await prisma.filePermission.findFirst({ where: { folderId, userId } })
  return Boolean(ownGrant)
}

/** Same rule as canAccessFolder, batched for a list of sibling folders. */
async function filterAccessibleFolders(
  folders: { id: string; createdById: string }[],
  userId: string
): Promise<Set<string>> {
  if (folders.length === 0) return new Set()

  const folderIds = folders.map((f) => f.id)
  const ownGrants = await prisma.filePermission.findMany({
    where: { folderId: { in: folderIds }, userId },
    select: { folderId: true },
  })
  const ownGrantIds = new Set(ownGrants.map((g) => g.folderId).filter((id): id is string => Boolean(id)))

  // Private by default: only creator or explicit grantee
  const visible = new Set<string>()
  for (const f of folders) {
    if (f.createdById === userId || ownGrantIds.has(f.id)) {
      visible.add(f.id)
    }
  }
  return visible
}

export interface FolderAccessGrant {
  id: string
  userId: string
  userName: string
  level: FilePermissionLevel
  createdAt: string
}

/** Only callable by the folder's creator. */
export async function getFolderAccessGrants(folderId: string): Promise<FolderAccessGrant[]> {
  const session = await requireApiSession()
  const folder = await prisma.folder.findFirst({
    where: { id: folderId, organizationId: session.user.organizationId },
    select: { createdById: true },
  })
  if (!folder) throw new Error('Folder not found')
  if (folder.createdById !== session.user.id) {
    throw new Error('You do not have permission to manage access for this folder.')
  }

  const rows = await prisma.filePermission.findMany({
    where: { folderId },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  })
  return rows
    .filter((r) => r.userId)
    .map((r) => ({
      id: r.id,
      userId: r.userId!,
      userName: r.user?.name ?? 'Unknown',
      level: r.level as FilePermissionLevel,
      createdAt: r.createdAt.toISOString(),
    }))
}

export async function grantFolderAccess(folderId: string, userId: string, level: FilePermissionLevel): Promise<void> {
  const session = await requireApiSession()
  const folder = await prisma.folder.findFirst({
    where: { id: folderId, organizationId: session.user.organizationId },
    select: { createdById: true },
  })
  if (!folder) throw new Error('Folder not found')
  if (folder.createdById !== session.user.id) {
    throw new Error('You do not have permission to manage access for this folder.')
  }

  const existing = await prisma.filePermission.findFirst({ where: { folderId, userId } })
  if (existing) {
    await prisma.filePermission.update({ where: { id: existing.id }, data: { level } })
  } else {
    await prisma.filePermission.create({
      data: { folderId, userId, level, createdById: session.user.id },
    })
  }
}

export async function revokeFolderAccess(grantId: string): Promise<void> {
  const session = await requireApiSession()
  const grant = await prisma.filePermission.findFirst({
    where: { id: grantId },
    include: { folder: { select: { organizationId: true, createdById: true } } },
  })
  if (!grant?.folder || grant.folder.organizationId !== session.user.organizationId) {
    throw new Error('Grant not found')
  }
  if (grant.folder.createdById !== session.user.id) {
    throw new Error('You do not have permission to manage access for this folder.')
  }
  await prisma.filePermission.delete({ where: { id: grantId } })
}

/** Latest STARRED/UNSTARRED or TRASHED/RESTORED action per file, from the activity log (no dedicated schema columns needed). */
export async function getLatestActionMap(
  fileIds: string[],
  actions: string[],
  scopeToUserId?: string
): Promise<Map<string, string>> {
  if (fileIds.length === 0) return new Map()
  const rows = await prisma.fileActivity.findMany({
    where: { fileId: { in: fileIds }, action: { in: actions }, ...(scopeToUserId ? { userId: scopeToUserId } : {}) },
    orderBy: { createdAt: 'desc' },
    select: { fileId: true, action: true },
  })
  const map = new Map<string, string>()
  for (const row of rows) {
    if (!map.has(row.fileId)) map.set(row.fileId, row.action)
  }
  return map
}

type FileRow = Awaited<ReturnType<typeof fetchFileRows>>[number]

/**
 * Which files a user can see — independent of, and layered on top of,
 * the folder-level access already enforced by canAccessFolder() above.
 *
 * Files are private by default: a user can only see files they uploaded
 * themselves or files they've been explicitly shared with via FileShare.
 * Even users with files.manage (Admin / Super Admin) do NOT see all
 * files — they must be explicitly shared like any other user.
 *
 * Visibility levels (ORGANIZATION/TEAM/DEPARTMENT) no longer grant
 * broad access — only individual FileShare grants make a file visible
 * to someone other than the owner.
 */
function fileVisibilityWhere(user: Session['user']): Prisma.FileWhereInput {
  const or: Prisma.FileWhereInput[] = [
    { uploadedById: user.id },
    {
      shares: {
        some: {
          sharedWithId: user.id,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      },
    },
  ]

  return { OR: or }
}

/**
 * Checks if a user can access a specific file (owner or explicitly shared).
 * Returns the file record if accessible, null otherwise.
 */
export async function canAccessFile(
  fileId: string,
  userId: string,
  organizationId: string
): Promise<{ id: string; uploadedById: string; secureUrl: string; fileName: string; mimeType: string } | null> {
  const file = await prisma.file.findFirst({
    where: { id: fileId, organizationId },
    select: { id: true, uploadedById: true, secureUrl: true, fileName: true, mimeType: true },
  })
  if (!file) return null
  if (file.uploadedById === userId) return file

  const share = await prisma.fileShare.findFirst({
    where: {
      fileId,
      sharedWithId: userId,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
  })
  if (!share) return null

  return file
}

/**
 * `extraWhere` (e.g. { folderId }) is combined via AND rather than a
 * plain spread, because fileVisibilityWhere() above returns an OR
 * clause — spreading two objects that both use the "OR" key would let
 * the second silently overwrite the first (see the same note in
 * services/meeting.service.ts#scopeWhere).
 */
async function fetchFileRows(
  organizationId: string,
  user: Session['user'],
  extraWhere: Prisma.FileWhereInput = {}
) {
  return prisma.file.findMany({
    where: {
      organizationId,
      AND: [fileVisibilityWhere(user), extraWhere],
    },
    include: { folder: { select: { name: true } }, uploadedBy: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  })
}

async function mapFiles(rows: FileRow[], userId: string): Promise<FileItem[]> {
  const ids = rows.map((r) => r.id)
  const [starMap, trashMap] = await Promise.all([
    getLatestActionMap(ids, ['STARRED', 'UNSTARRED'], userId),
    getLatestActionMap(ids, ['TRASHED', 'RESTORED']),
  ])
  return rows.map((r) => ({
    id: r.id,
    fileName: r.fileName,
    originalName: r.originalName,
    mimeType: r.mimeType,
    fileSize: r.fileSize.toString(),
    secureUrl: r.secureUrl,
    thumbnailUrl: r.thumbnailUrl,
    visibility: r.visibility as FileVisibility,
    folderId: r.folderId,
    folderName: r.folder?.name ?? null,
    uploadedBy: r.uploadedBy.name ?? 'Unknown',
    uploadedByInitials: initials(r.uploadedBy.name ?? 'U'),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    isStarred: starMap.get(r.id) === 'STARRED',
    isTrashed: trashMap.get(r.id) === 'TRASHED',
  }))
}

// ============================================================
// Folder browsing
// ============================================================

export async function getFolderContents(folderId: string | null): Promise<{ folders: FolderItem[]; files: FileItem[] }> {
  const session = await requireApiSession()
  const organizationId = session.user.organizationId

  // A folder the user is navigating INTO must itself be accessible — this
  // is what actually keeps someone from typing another folder's id into
  // the URL and browsing its contents anyway.
  if (folderId) {
    const allowed = await canAccessFolder(folderId, session.user.id, organizationId)
    if (!allowed) throw new Error('You do not have access to this folder.')
  }

  const [folderRows, fileRows] = await Promise.all([
    prisma.folder.findMany({
      where: { organizationId, parentId: folderId },
      include: { createdBy: { select: { name: true } }, _count: { select: { files: true } } },
      orderBy: { name: 'asc' },
    }),
    fetchFileRows(organizationId, session.user, { folderId }),
  ])

  // Sub-folders in a listing get the same check individually — a folder
  // with grants set on it shouldn't show up for people outside the grant
  // list just because they can see its parent.
  const visibleFolderIds = await filterAccessibleFolders(
    folderRows.map((f) => ({ id: f.id, createdById: f.createdById })),
    session.user.id
  )

  const allFiles = await mapFiles(fileRows, session.user.id)
  const files = allFiles.filter((f) => !f.isTrashed)

  const folders: FolderItem[] = folderRows
    .filter((f) => visibleFolderIds.has(f.id))
    .map((f) => ({
      id: f.id,
      name: f.name,
      parentId: f.parentId,
      fileCount: f._count.files,
      createdBy: f.createdBy.name ?? 'Unknown',
      createdAt: f.createdAt.toISOString(),
    }))

  return { folders, files }
}

export async function getFolderPath(folderId: string | null): Promise<{ id: string; name: string }[]> {
  if (!folderId) return []
  const session = await requireApiSession()
  const path: { id: string; name: string }[] = []
  let current = await prisma.folder.findFirst({
    where: { id: folderId, organizationId: session.user.organizationId },
    select: { id: true, name: true, parentId: true },
  })
  while (current) {
    path.unshift({ id: current.id, name: current.name })
    if (!current.parentId) break
    current = await prisma.folder.findFirst({
      where: { id: current.parentId, organizationId: session.user.organizationId },
      select: { id: true, name: true, parentId: true },
    })
  }
  return path
}

export async function getAllFoldersFlat(): Promise<{ id: string; name: string; parentId: string | null }[]> {
  const session = await requireApiSession()
  const all = await prisma.folder.findMany({
    where: { organizationId: session.user.organizationId },
    select: { id: true, name: true, parentId: true, createdById: true },
    orderBy: { name: 'asc' },
  })
  if (all.length === 0) return []
  const folderIds = all.map((f) => f.id)
  const ownGrants = await prisma.filePermission.findMany({
    where: { folderId: { in: folderIds }, userId: session.user.id },
    select: { folderId: true },
  })
  const ownGrantIds = new Set(ownGrants.map((g) => g.folderId).filter((id): id is string => Boolean(id)))
  return all
    .filter((f) => f.createdById === session.user.id || ownGrantIds.has(f.id))
    .map(({ id, name, parentId }) => ({ id, name, parentId }))
}

export async function createFolder(name: string, parentId: string | null) {
  const session = await requireApiSession()
  if (parentId) {
    const allowed = await canAccessFolder(parentId, session.user.id, session.user.organizationId)
    if (!allowed) throw new Error('You do not have access to parent folder.')
  }
  await prisma.folder.create({
    data: { name, parentId, organizationId: session.user.organizationId, createdById: session.user.id },
  })
}

export async function deleteFolder(id: string) {
  const session = await requireApiSession()
  const existing = await prisma.folder.findFirst({ where: { id, organizationId: session.user.organizationId }, select: { createdById: true } })
  if (!existing) return
  if (existing.createdById !== session.user.id) throw new Error('You do not have access to this folder.')
  await prisma.folder.delete({ where: { id } })
  await logActivity('N/A', session.user.id, 'FOLDER_DELETED', { folderId: id })
}

// ============================================================
// File CRUD
// ============================================================

export async function createFileRecord(input: {
  fileName: string
  originalName: string
  mimeType: string
  fileSize: number
  cloudinaryPublicId: string
  cloudinaryResourceType: string
  secureUrl: string
  thumbnailUrl: string | null
  version: string
  folderId: string | null
  visibility: FileVisibility
}) {
  const session = await requireApiSession()
  const file = await prisma.file.create({
    data: {
      fileName: input.fileName,
      originalName: input.originalName,
      mimeType: input.mimeType,
      fileSize: BigInt(input.fileSize),
      cloudinaryPublicId: input.cloudinaryPublicId,
      cloudinaryResourceType: input.cloudinaryResourceType,
      secureUrl: input.secureUrl,
      thumbnailUrl: input.thumbnailUrl,
      version: input.version,
      folderId: input.folderId,
      visibility: input.visibility,
      organizationId: session.user.organizationId,
      uploadedById: session.user.id,
    },
  })
  await logActivity(file.id, session.user.id, 'UPLOADED')
  return file.id
}

// ============================================================
// File versioning (audit: "File Versioning — no version history, no
// restore previous version"). Replacing a file's content keeps the same
// File.id (and therefore every share/permission/link to it) while
// snapshotting what was live before the replace into FileVersion, so it
// can be viewed or restored later. The old Cloudinary asset is kept
// (not deleted) precisely so old versions stay downloadable.
// ============================================================

export interface FileVersionItem {
  id: string
  versionNumber: number
  originalName: string
  mimeType: string
  fileSize: string
  secureUrl: string
  thumbnailUrl: string | null
  uploadedBy: string
  createdAt: string
  isCurrent: boolean
}

/** Uploads a new version's content onto an existing File, snapshotting the previous content as history. */
export async function replaceFileContent(
  fileId: string,
  upload: {
    originalName: string
    mimeType: string
    fileSize: number
    cloudinaryPublicId: string
    cloudinaryResourceType: string
    secureUrl: string
    thumbnailUrl: string | null
  }
): Promise<void> {
  const session = await requireApiSession()
  const existing = await prisma.file.findFirst({
    where: { id: fileId, organizationId: session.user.organizationId },
    select: {
      uploadedById: true,
      originalName: true,
      mimeType: true,
      fileSize: true,
      cloudinaryPublicId: true,
      cloudinaryResourceType: true,
      secureUrl: true,
      thumbnailUrl: true,
      updatedAt: true,
    },
  })
  if (!existing) throw new Error('File not found')
  if (existing.uploadedById !== session.user.id) throw new Error('You do not have access to this file.')

  const lastVersion = await prisma.fileVersion.findFirst({
    where: { fileId },
    orderBy: { versionNumber: 'desc' },
    select: { versionNumber: true },
  })
  const nextVersionNumber = (lastVersion?.versionNumber ?? 0) + 1

  await prisma.$transaction([
    // Snapshot what was live before this replace.
    prisma.fileVersion.create({
      data: {
        fileId,
        versionNumber: nextVersionNumber,
        originalName: existing.originalName,
        mimeType: existing.mimeType,
        fileSize: existing.fileSize,
        cloudinaryPublicId: existing.cloudinaryPublicId,
        cloudinaryResourceType: existing.cloudinaryResourceType,
        secureUrl: existing.secureUrl,
        thumbnailUrl: existing.thumbnailUrl,
        uploadedById: existing.uploadedById,
        createdAt: existing.updatedAt,
      },
    }),
    // Point the File at the new content.
    prisma.file.update({
      where: { id: fileId },
      data: {
        originalName: upload.originalName,
        mimeType: upload.mimeType,
        fileSize: BigInt(upload.fileSize),
        cloudinaryPublicId: upload.cloudinaryPublicId,
        cloudinaryResourceType: upload.cloudinaryResourceType,
        secureUrl: upload.secureUrl,
        thumbnailUrl: upload.thumbnailUrl,
      },
    }),
  ])

  await logActivity(fileId, session.user.id, 'VERSION_UPLOADED', { versionNumber: nextVersionNumber })
}

export async function getFileVersions(fileId: string): Promise<FileVersionItem[]> {
  const session = await requireApiSession()
  const file = await prisma.file.findFirst({
    where: { id: fileId, organizationId: session.user.organizationId },
    select: { uploadedById: true, uploadedBy: { select: { name: true } }, originalName: true, mimeType: true, fileSize: true, secureUrl: true, thumbnailUrl: true, updatedAt: true },
  })
  if (!file) throw new Error('File not found')
  if (file.uploadedById !== session.user.id) throw new Error('You do not have access to this file.')

  const versions = await prisma.fileVersion.findMany({
    where: { fileId },
    include: { uploadedBy: { select: { name: true } } },
    orderBy: { versionNumber: 'desc' },
  })

  const current: FileVersionItem = {
    id: fileId,
    versionNumber: (versions[0]?.versionNumber ?? 0) + 1,
    originalName: file.originalName,
    mimeType: file.mimeType,
    fileSize: file.fileSize.toString(),
    secureUrl: file.secureUrl,
    thumbnailUrl: file.thumbnailUrl,
    uploadedBy: file.uploadedBy.name ?? 'Unknown',
    createdAt: file.updatedAt.toISOString(),
    isCurrent: true,
  }

  const history: FileVersionItem[] = versions.map((v) => ({
    id: v.id,
    versionNumber: v.versionNumber,
    originalName: v.originalName,
    mimeType: v.mimeType,
    fileSize: v.fileSize.toString(),
    secureUrl: v.secureUrl,
    thumbnailUrl: v.thumbnailUrl,
    uploadedBy: v.uploadedBy.name ?? 'Unknown',
    createdAt: v.createdAt.toISOString(),
    isCurrent: false,
  }))

  return [current, ...history]
}

/** Makes a past version live again — snapshots the current content first, so restoring is itself undoable. */
export async function restoreFileVersion(fileId: string, versionId: string): Promise<void> {
  const session = await requireApiSession()
  const [file, version] = await Promise.all([
    prisma.file.findFirst({
      where: { id: fileId, organizationId: session.user.organizationId },
      select: { uploadedById: true, originalName: true, mimeType: true, fileSize: true, cloudinaryPublicId: true, cloudinaryResourceType: true, secureUrl: true, thumbnailUrl: true, updatedAt: true },
    }),
    prisma.fileVersion.findFirst({ where: { id: versionId, fileId } }),
  ])
  if (!file || !version) throw new Error('File or version not found')
  if (file.uploadedById !== session.user.id) throw new Error('You do not have access to this file.')

  const lastVersion = await prisma.fileVersion.findFirst({
    where: { fileId },
    orderBy: { versionNumber: 'desc' },
    select: { versionNumber: true },
  })
  const nextVersionNumber = (lastVersion?.versionNumber ?? 0) + 1

  await prisma.$transaction([
    prisma.fileVersion.create({
      data: {
        fileId,
        versionNumber: nextVersionNumber,
        originalName: file.originalName,
        mimeType: file.mimeType,
        fileSize: file.fileSize,
        cloudinaryPublicId: file.cloudinaryPublicId,
        cloudinaryResourceType: file.cloudinaryResourceType,
        secureUrl: file.secureUrl,
        thumbnailUrl: file.thumbnailUrl,
        uploadedById: file.uploadedById,
        createdAt: file.updatedAt,
      },
    }),
    prisma.file.update({
      where: { id: fileId },
      data: {
        originalName: version.originalName,
        mimeType: version.mimeType,
        fileSize: version.fileSize,
        cloudinaryPublicId: version.cloudinaryPublicId,
        cloudinaryResourceType: version.cloudinaryResourceType,
        secureUrl: version.secureUrl,
        thumbnailUrl: version.thumbnailUrl,
      },
    }),
  ])

  await logActivity(fileId, session.user.id, 'VERSION_RESTORED', { restoredVersionNumber: version.versionNumber })
}

export async function getRecentFiles(): Promise<FileItem[]> {
  const session = await requireApiSession()
  const rows = await fetchFileRows(session.user.organizationId, session.user)
  const files = await mapFiles(rows.slice(0, 60), session.user.id)
  return files.filter((f) => !f.isTrashed).slice(0, 40)
}

export async function getStarredFiles(): Promise<FileItem[]> {
  const session = await requireApiSession()
  const rows = await fetchFileRows(session.user.organizationId, session.user)
  const files = await mapFiles(rows, session.user.id)
  return files.filter((f) => f.isStarred && !f.isTrashed)
}

export async function getTrashedFiles(): Promise<FileItem[]> {
  const session = await requireApiSession()
  const rows = await fetchFileRows(session.user.organizationId, session.user)
  const files = await mapFiles(rows, session.user.id)
  return files.filter((f) => f.isTrashed)
}

export async function toggleStar(fileId: string, star: boolean) {
  const session = await requireApiSession()
  const file = await prisma.file.findFirst({ where: { id: fileId, organizationId: session.user.organizationId }, select: { uploadedById: true } })
  if (!file) return
  if (file.uploadedById !== session.user.id) throw new Error('You do not have access to this file.')
  await logActivity(fileId, session.user.id, star ? 'STARRED' : 'UNSTARRED')
}

export async function trashFile(fileId: string) {
  const session = await requireApiSession()
  const file = await prisma.file.findFirst({ where: { id: fileId, organizationId: session.user.organizationId }, select: { uploadedById: true } })
  if (!file) return
  if (file.uploadedById !== session.user.id) throw new Error('You do not have access to this file.')
  await logActivity(fileId, session.user.id, 'TRASHED')
}

export async function restoreFile(fileId: string) {
  const session = await requireApiSession()
  const file = await prisma.file.findFirst({ where: { id: fileId, organizationId: session.user.organizationId }, select: { uploadedById: true } })
  if (!file) return
  if (file.uploadedById !== session.user.id) throw new Error('You do not have access to this file.')
  await logActivity(fileId, session.user.id, 'RESTORED')
}

export async function permanentlyDeleteFile(fileId: string) {
  const session = await requireApiSession()
  const file = await prisma.file.findFirst({ where: { id: fileId, organizationId: session.user.organizationId }, select: { uploadedById: true, cloudinaryPublicId: true, cloudinaryResourceType: true } })
  if (!file) return
  if (file.uploadedById !== session.user.id) throw new Error('You do not have access to this file.')
  await deleteFromCloudinary(file.cloudinaryPublicId, file.cloudinaryResourceType)
  await prisma.file.delete({ where: { id: fileId } })
}

export async function updateFileVisibility(fileId: string, visibility: FileVisibility) {
  const session = await requireApiSession()
  const file = await prisma.file.findFirst({ where: { id: fileId, organizationId: session.user.organizationId }, select: { uploadedById: true } })
  if (!file) return
  if (file.uploadedById !== session.user.id) throw new Error('You do not have access to this file.')
  await prisma.file.update({ where: { id: fileId }, data: { visibility } })
  await logActivity(fileId, session.user.id, 'VISIBILITY_CHANGED', { visibility })
}

// ============================================================
// Sharing
// ============================================================

export async function shareFile(fileId: string, sharedWithId: string, level: FilePermissionLevel, expiresAt?: Date) {
  const session = await requireApiSession()
  const file = await prisma.file.findFirst({ where: { id: fileId, organizationId: session.user.organizationId }, select: { uploadedById: true } })
  if (!file) throw new Error('File not found')
  if (file.uploadedById !== session.user.id) throw new Error('You do not have access to this file.')
  await prisma.fileShare.create({
    data: { fileId, sharedById: session.user.id, sharedWithId, level, expiresAt: expiresAt ?? null },
  })
  await logActivity(fileId, session.user.id, 'SHARED', { sharedWithId, level })
}

export async function getSharedWithMe(): Promise<SharedFileItem[]> {
  const session = await requireApiSession()
  const shares = await prisma.fileShare.findMany({
    where: { sharedWithId: session.user.id, file: { organizationId: session.user.organizationId } },
    include: {
      file: { include: { folder: { select: { name: true } }, uploadedBy: { select: { name: true } } } },
      sharedBy: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
  const fileRows = shares.map((s) => s.file)
  const mapped = await mapFiles(fileRows, session.user.id)
  const byId = new Map(mapped.map((f) => [f.id, f]))

  return shares
    .map((s) => {
      const base = byId.get(s.fileId)
      if (!base) return null
      const item: SharedFileItem = {
        ...base,
        sharedBy: s.sharedBy.name ?? 'Unknown',
        sharedAt: s.createdAt.toISOString(),
        permissionLevel: s.level as FilePermissionLevel,
      }
      return item
    })
    .filter((x): x is SharedFileItem => x !== null)
}

// ============================================================
// Categories
// ============================================================

export async function getCategories(): Promise<FileCategoryItem[]> {
  const session = await requireApiSession()
  const rows = await prisma.fileCategory.findMany({
    where: { organizationId: session.user.organizationId },
    orderBy: { name: 'asc' },
  })
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    color: r.color,
    icon: r.icon,
    createdAt: r.createdAt.toISOString(),
  }))
}

export async function createCategory(input: { name: string; description?: string; color?: string; icon?: string }) {
  const session = await requireApiSession()
  await prisma.fileCategory.create({
    data: {
      name: input.name,
      description: input.description || null,
      color: input.color || null,
      icon: input.icon || null,
      organizationId: session.user.organizationId,
    },
  })
}

export async function deleteCategory(id: string) {
  const session = await requireApiSession()
  await prisma.fileCategory.deleteMany({ where: { id, organizationId: session.user.organizationId } })
}

export { resourceTypeForMime }