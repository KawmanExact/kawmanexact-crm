import 'server-only'
import { BaseTemplate, TextTemplate } from './base'

export interface FileSharedTemplateProps {
  fileName: string
  fileType: string
  fileSize: number
  sharedByName: string
  permission: 'VIEWER' | 'EDITOR' | 'MANAGER'
  fileUrl: string
  organizationName: string
  message?: string
}

export function FileSharedTemplate({
  fileName,
  fileType,
  fileSize,
  sharedByName,
  permission,
  fileUrl,
  organizationName,
  message,
}: FileSharedTemplateProps): { html: string; text: string } {
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const permissionLabels: Record<string, string> = {
    VIEWER: 'View only',
    EDITOR: 'Can edit',
    MANAGER: 'Full access',
  }

  const html = BaseTemplate({
    title: 'File Shared with You',
    preheader: `${sharedByName} shared "${fileName}" with ${permissionLabels[permission].toLowerCase()} access`,
    children: `
      <p>Hi there,</p>
      <p><strong>${sharedByName}</strong> has shared a file with you in <strong>${organizationName}</strong>.</p>
      
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 24px 0;">
        <p style="margin: 0 0 8px; font-size: 15px;"><strong>File:</strong> ${fileName}</p>
        <p style="margin: 0 0 8px; font-size: 14px;"><strong>Type:</strong> ${fileType}</p>
        <p style="margin: 0 0 8px; font-size: 14px;"><strong>Size:</strong> ${formatSize(fileSize)}</p>
        <p style="margin: 0 0 8px; font-size: 14px;"><strong>Access:</strong> <span style="color: #7c3aed; font-weight: 600;">${permissionLabels[permission]}</span></p>
        <p style="margin: 0; font-size: 14px; color: #64748b;">Shared by: ${sharedByName}</p>
      </div>
      
      ${message ? `
        <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin: 24px 0;">
          <p style="margin: 0 0 8px; font-size: 13px; font-weight: 600; color: #166534;">Message from ${sharedByName}</p>
          <p style="margin: 0; font-size: 14px; color: #14532d;">${message}</p>
        </div>
      ` : ''}
      
      <p>Access the file to view or collaborate.</p>
    `,
    cta: {
      text: 'Open File',
      url: fileUrl,
    },
  })

  const text = TextTemplate({
    title: 'File Shared with You',
    children: `Hi there,\n\n${sharedByName} has shared a file with you in ${organizationName}.\n\nFile: ${fileName}\nType: ${fileType}\nSize: ${formatSize(fileSize)}\nAccess: ${permissionLabels[permission]}\nShared by: ${sharedByName}\n${message ? `\nMessage: ${message}\n` : ''}\nAccess the file to view or collaborate.`,
    cta: {
      text: 'Open File',
      url: fileUrl,
    },
  })

  return { html, text }
}