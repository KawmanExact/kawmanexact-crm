import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  prisma: {
    meeting: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    meetingRecording: { create: vi.fn() },
    meetingTranscript: { create: vi.fn() },
    meetingSummary: { create: vi.fn() },
    contact: { findFirst: vi.fn(), create: vi.fn() },
    activity: { create: vi.fn() },
  },
}))

vi.mock('@/lib/session', () => ({
  requireApiSession: vi.fn(),
}))

vi.mock('@/lib/csrf', () => ({
  validateCsrf: vi.fn(),
}))

vi.mock('@/lib/audit-log', () => ({
  logAudit: vi.fn(),
}))

vi.mock('@/lib/record-scope', () => ({
  canManageAssignments: vi.fn(),
  contactOwnerScopeWhere: vi.fn(),
  ownerScopeWhere: vi.fn(),
}))

vi.mock('@/services/company.service', () => ({
  findOrCreateCompanyByName: vi.fn(),
}))

vi.mock('@/services/contact.service', () => ({
  findOrCreateContactByName: vi.fn(),
}))

vi.mock('@/services/meeting.service', () => ({
  saveTranscript: vi.fn(),
  addRecordingLink: vi.fn(),
  generateMeetingSummary: vi.fn(),
  updateMeetingSummaryText: vi.fn(),
  processTranscription: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/transcription', () => ({
  transcribeVideo: vi.fn(),
}))

vi.mock('next/server', () => ({
  after: vi.fn((fn: () => Promise<unknown>) => {
    void fn()
  }),
}))

vi.mock('@/services/queue.service', () => ({
  queueTranscription: vi.fn().mockResolvedValue('job-id'),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}))

// Partial mock: keep the real (pure, env-based) validation helpers so the
// rejection tests exercise the actual server-side checks, but stub out the
// side-effectful Cloudinary calls that the action no longer uses directly.
vi.mock('@/lib/cloudinary', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/cloudinary')>()
  return {
    ...actual,
    isCloudinaryConfigured: vi.fn(),
    uploadToCloudinary: vi.fn(),
  }
})

import { prisma } from '@/lib/db'
import { requireApiSession } from '@/lib/session'
import { validateCsrf } from '@/lib/csrf'
import { findOrCreateContactByName } from '@/services/contact.service'
import { findOrCreateCompanyByName } from '@/services/company.service'
import { isCloudinaryConfigured, uploadToCloudinary } from '@/lib/cloudinary'
import { createMeetingAction, createMeetingWithVideoAction } from '@/app/meetings/actions'
import { queueTranscription } from '@/services/queue.service'

const mockQueueTranscription = vi.mocked(queueTranscription)
const mockMeetingCreate = vi.mocked(prisma.meeting.create)
const mockMeetingRecordingCreate = vi.mocked(prisma.meetingRecording.create)
const mockContactCreate = vi.mocked(prisma.contact.create)
const mockFindOrCreateContactByName = vi.mocked(findOrCreateContactByName)
const mockFindOrCreateCompanyByName = vi.mocked(findOrCreateCompanyByName)
const mockRequireApiSession = vi.mocked(requireApiSession)
const mockValidateCsrf = vi.mocked(validateCsrf)
const mockIsCloudinaryConfigured = vi.mocked(isCloudinaryConfigured)
const mockUploadToCloudinary = vi.mocked(uploadToCloudinary)

function formData(obj: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(obj)) fd.set(k, v)
  return fd
}

const mockSession = {
  user: {
    id: 'user-1',
    email: 'creator@test.com',
    name: 'Test Creator',
    organizationId: 'org-A',
    permissions: ['meetings.create', 'meetings.update'],
  },
}

const VALID_VIDEO_URL = 'https://res.cloudinary.com/test-cloud/video/upload/test-vid.mp4'
const VALID_PUBLIC_ID = 'kawman-exact/org-A/test-recording'
const VALID_BYTES = 1024

function videoFormData(overrides: Record<string, string> = {}): FormData {
  const fd = formData({ title: 'Video Meeting', ...overrides })
  fd.set('videoUrl', VALID_VIDEO_URL)
  fd.set('videoPublicId', VALID_PUBLIC_ID)
  fd.set('videoBytes', String(VALID_BYTES))
  return fd
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('CLOUDINARY_CLOUD_NAME', 'test-cloud')
  mockRequireApiSession.mockResolvedValue(mockSession)
  mockValidateCsrf.mockResolvedValue(undefined)
  mockFindOrCreateCompanyByName.mockResolvedValue(null)
  mockIsCloudinaryConfigured.mockReturnValue(true)
  mockUploadToCloudinary.mockResolvedValue({
    publicId: 'test-pub-id',
    secureUrl: 'https://test.com/video.mp4',
    fileSize: 42,
  })
  mockMeetingCreate.mockResolvedValue({
    id: 'meeting-1',
    title: 'Test Meeting',
    organizationId: 'org-A',
  } as never)
  mockMeetingRecordingCreate.mockResolvedValue({ id: 'rec-1' } as never)
})

describe('createMeetingAction', () => {
  it('creates/links contact when contactName is provided', async () => {
    mockFindOrCreateContactByName.mockResolvedValue({ id: 'contact-123', name: 'New Contact' })

    await createMeetingAction({} as never, formData({
      title: 'Team Sync',
      contactName: 'New Contact',
      contactEmail: 'new@test.com',
      contactMobile: '+91 98765 43210',
    }))

    expect(mockFindOrCreateContactByName).toHaveBeenCalledWith({
      email: 'new@test.com',
      mobile: '+91 98765 43210',
      name: 'New Contact',
      organizationId: 'org-A',
      ownerId: 'user-1',
      companyId: null,
    })
    expect(mockMeetingCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          contactId: 'contact-123',
        }),
      }),
    )
  })

  it('links existing contactId when findOrCreateContactByName returns one', async () => {
    mockFindOrCreateContactByName.mockResolvedValue({ id: 'contact-123', name: 'Existing Contact' })

    await createMeetingAction({} as never, formData({
      title: 'Team Sync',
      contactName: 'Existing Contact',
    }))

    expect(mockFindOrCreateContactByName).toHaveBeenCalledWith({
      email: null,
      mobile: null,
      name: 'Existing Contact',
      organizationId: 'org-A',
      ownerId: 'user-1',
      companyId: null,
    })
    expect(mockMeetingCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          contactId: 'contact-123',
        }),
      }),
    )
    expect(mockContactCreate).not.toHaveBeenCalled()
  })

  it('does not call findOrCreateContactByName when no contactName field is provided', async () => {
    await createMeetingAction({} as never, formData({
      title: 'Team Sync',
    }))

    expect(mockFindOrCreateContactByName).not.toHaveBeenCalled()
    expect(mockContactCreate).not.toHaveBeenCalled()
    expect(mockMeetingCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          contactId: null,
        }),
      }),
    )
  })
})

describe('createMeetingWithVideoAction', () => {
  it('creates/links contact when contactName is provided', async () => {
    mockFindOrCreateContactByName.mockResolvedValue({ id: 'contact-456', name: 'Video Contact' })

    const fd = videoFormData({ contactName: 'Video Contact', contactEmail: 'video@test.com' })

    const result = await createMeetingWithVideoAction({} as never, fd)

    expect(mockFindOrCreateContactByName).toHaveBeenCalledWith({
      email: 'video@test.com',
      mobile: null,
      name: 'Video Contact',
      organizationId: 'org-A',
      ownerId: 'user-1',
      companyId: null,
    })
    expect(mockMeetingCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          contactId: 'contact-456',
        }),
      }),
    )
    expect(result.meetingId).toBe('meeting-1')
  })

  it('links existing contactId when findOrCreateContactByName returns one', async () => {
    mockFindOrCreateContactByName.mockResolvedValue({ id: 'contact-456', name: 'Existing Contact' })

    const fd = videoFormData({ contactName: 'Existing Contact' })

    const result = await createMeetingWithVideoAction({} as never, fd)

    expect(mockFindOrCreateContactByName).toHaveBeenCalledWith({
      email: null,
      mobile: null,
      name: 'Existing Contact',
      organizationId: 'org-A',
      ownerId: 'user-1',
      companyId: null,
    })
    expect(mockMeetingCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          contactId: 'contact-456',
        }),
      }),
    )
    expect(result.meetingId).toBe('meeting-1')
  })

  it('creates a meetingRecording and queues transcription without uploading server-side', async () => {
    const fd = videoFormData()

    const result = await createMeetingWithVideoAction({} as never, fd)

    expect(result.meetingId).toBe('meeting-1')
    expect(mockUploadToCloudinary).not.toHaveBeenCalled()
    expect(mockMeetingRecordingCreate).toHaveBeenCalledWith({
      data: {
        meetingId: 'meeting-1',
        cloudinaryPublicId: VALID_PUBLIC_ID,
        secureUrl: VALID_VIDEO_URL,
        duration: null,
        fileSize: BigInt(VALID_BYTES),
      },
    })
    expect(mockQueueTranscription).toHaveBeenCalledWith({
      meetingId: 'meeting-1',
      recordingId: '',
      videoUrl: VALID_VIDEO_URL,
      organizationId: 'org-A',
    })
  })

  it('rejects a videoUrl from another cloud', async () => {
    const fd = videoFormData()
    fd.set('videoUrl', 'https://example.com/video/upload/test-vid.mp4')

    const result = await createMeetingWithVideoAction({} as never, fd)

    expect(result.fieldErrors?.videoFile).toBe('Video upload is missing or invalid')
    expect(mockMeetingCreate).not.toHaveBeenCalled()
    expect(mockMeetingRecordingCreate).not.toHaveBeenCalled()
  })

  it('rejects a publicId outside the user org folder', async () => {
    const fd = videoFormData()
    fd.set('videoPublicId', 'kawman-exact/other-org/test-recording')

    const result = await createMeetingWithVideoAction({} as never, fd)

    expect(result.fieldErrors?.videoFile).toBe('Video upload is missing or invalid')
    expect(mockMeetingCreate).not.toHaveBeenCalled()
    expect(mockMeetingRecordingCreate).not.toHaveBeenCalled()
  })

  it('rejects bad videoBytes', async () => {
    const fd = videoFormData()
    fd.set('videoBytes', '0')

    const result = await createMeetingWithVideoAction({} as never, fd)

    expect(result.fieldErrors?.videoFile).toBe('Video upload is missing or invalid')
    expect(mockMeetingCreate).not.toHaveBeenCalled()
    expect(mockMeetingRecordingCreate).not.toHaveBeenCalled()
  })
})
