// File Management domain types. Mirror prisma/schema.prisma (File, Folder,
// FileShare, FileCategory, FileActivity). Star/trash state is derived from
// FileActivity log entries rather than dedicated schema columns.

export type FileVisibility = 'PRIVATE' | 'TEAM' | 'DEPARTMENT' | 'ORGANIZATION' | 'SHARED'
export type FilePermissionLevel = 'VIEWER' | 'EDITOR' | 'MANAGER'

export interface FileItem {
  id: string
  fileName: string
  originalName: string
  mimeType: string
  fileSize: string
  secureUrl: string
  thumbnailUrl: string | null
  visibility: FileVisibility
  folderId: string | null
  folderName: string | null
  uploadedBy: string
  uploadedByInitials: string
  createdAt: string
  updatedAt: string
  isStarred: boolean
  isTrashed: boolean
}

export interface FolderItem {
  id: string
  name: string
  parentId: string | null
  fileCount: number
  createdBy: string
  createdAt: string
}

export interface FileCategoryItem {
  id: string
  name: string
  description: string | null
  color: string | null
  icon: string | null
  createdAt: string
}

export interface SharedFileItem extends FileItem {
  sharedBy: string
  sharedAt: string
  permissionLevel: FilePermissionLevel
}
