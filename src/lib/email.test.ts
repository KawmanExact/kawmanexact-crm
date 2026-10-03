import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockSendMail = vi.fn()

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: mockSendMail,
    })),
  },
}))

describe('email (SMTP via nodemailer)', () => {
  beforeEach(() => {
    vi.resetModules()
    mockSendMail.mockReset()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('isEmailConfigured', () => {
    it('returns false when SMTP vars are missing', async () => {
      vi.stubEnv('SMTP_HOST', '')
      vi.stubEnv('SMTP_USER', '')
      vi.stubEnv('SMTP_PASS', '')
      vi.stubEnv('EMAIL_FROM', '')
      const email = await vi.importActual<typeof import('@/lib/email')>('@/lib/email')
      expect(email.isEmailConfigured()).toBe(false)
    })

    it('returns false when only some vars are set', async () => {
      vi.stubEnv('SMTP_HOST', 'smtp.zoho.in')
      vi.stubEnv('SMTP_USER', '')
      vi.stubEnv('SMTP_PASS', '')
      vi.stubEnv('EMAIL_FROM', '')
      const email = await vi.importActual<typeof import('@/lib/email')>('@/lib/email')
      expect(email.isEmailConfigured()).toBe(false)
    })

    it('returns true when all SMTP vars + EMAIL_FROM are set', async () => {
      vi.stubEnv('SMTP_HOST', 'smtp.zoho.in')
      vi.stubEnv('SMTP_PORT', '465')
      vi.stubEnv('SMTP_USER', 'mail@kawmanexact.com')
      vi.stubEnv('SMTP_PASS', 'app-password-123')
      vi.stubEnv('EMAIL_FROM', 'mail@kawmanexact.com')
      const email = await vi.importActual<typeof import('@/lib/email')>('@/lib/email')
      expect(email.isEmailConfigured()).toBe(true)
    })
  })

  describe('sendEmail', () => {
    it('logs NOT SENT and returns delivered:false when SMTP vars missing', async () => {
      vi.stubEnv('SMTP_HOST', '')
      vi.stubEnv('SMTP_USER', '')
      vi.stubEnv('SMTP_PASS', '')
      vi.stubEnv('EMAIL_FROM', '')
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const email = await vi.importActual<typeof import('@/lib/email')>('@/lib/email')
      const result = await email.sendEmail({
        to: 'user@example.com',
        subject: 'Reset your password',
        html: '<p>Click to reset</p>',
      })
      expect(result).toEqual({ delivered: false })
      const logged = warnSpy.mock.calls[0]?.[0] as string
      expect(logged).toContain('[email:dev] ✗ NOT SENT')
      expect(logged).toContain('SMTP_HOST')
      expect(logged).toContain('user@example.com')
      warnSpy.mockRestore()
    })

    it('sends via SMTP and returns delivered:true when configured', async () => {
      vi.stubEnv('SMTP_HOST', 'smtp.zoho.in')
      vi.stubEnv('SMTP_PORT', '465')
      vi.stubEnv('SMTP_USER', 'mail@kawmanexact.com')
      vi.stubEnv('SMTP_PASS', 'app-password-123')
      vi.stubEnv('EMAIL_FROM', 'mail@kawmanexact.com')
      mockSendMail.mockResolvedValue({ messageId: 'test-message-id' })
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const email = await vi.importActual<typeof import('@/lib/email')>('@/lib/email')
      const result = await email.sendEmail({
        to: 'recipient@example.com',
        subject: 'Reset your password',
        html: '<p>Click to reset</p>',
      })
      expect(result).toEqual({ delivered: true })
      expect(mockSendMail).toHaveBeenCalledTimes(1)
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'mail@kawmanexact.com',
          to: 'recipient@example.com',
          subject: 'Reset your password',
          html: '<p>Click to reset</p>',
        }),
      )
      const logged = logSpy.mock.calls[0]?.[0] as string
      expect(logged).toContain('[email] ✓ Sent via SMTP')
      expect(logged).toContain('recipient@example.com')
      logSpy.mockRestore()
    })

    it('uses custom text when provided', async () => {
      vi.stubEnv('SMTP_HOST', 'smtp.zoho.in')
      vi.stubEnv('SMTP_PORT', '465')
      vi.stubEnv('SMTP_USER', 'mail@kawmanexact.com')
      vi.stubEnv('SMTP_PASS', 'app-password-123')
      vi.stubEnv('EMAIL_FROM', 'mail@kawmanexact.com')
      mockSendMail.mockResolvedValue({ messageId: 'id' })
      const email = await vi.importActual<typeof import('@/lib/email')>('@/lib/email')
      await email.sendEmail({
        to: 'recipient@example.com',
        subject: 'Test',
        html: '<p>HTML body</p>',
        text: 'Custom plain text',
      })
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Custom plain text',
        }),
      )
    })

    it('auto-derives text from html when text is omitted', async () => {
      vi.stubEnv('SMTP_HOST', 'smtp.zoho.in')
      vi.stubEnv('SMTP_PORT', '465')
      vi.stubEnv('SMTP_USER', 'mail@kawmanexact.com')
      vi.stubEnv('SMTP_PASS', 'app-password-123')
      vi.stubEnv('EMAIL_FROM', 'mail@kawmanexact.com')
      mockSendMail.mockResolvedValue({ messageId: 'id' })
      const email = await vi.importActual<typeof import('@/lib/email')>('@/lib/email')
      await email.sendEmail({
        to: 'recipient@example.com',
        subject: 'Test',
        html: '<p>Hello</p> <p>World</p>',
      })
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Hello World',
        }),
      )
    })

    it('returns delivered:false and logs error on SMTP failure', async () => {
      vi.stubEnv('SMTP_HOST', 'smtp.zoho.in')
      vi.stubEnv('SMTP_PORT', '465')
      vi.stubEnv('SMTP_USER', 'mail@kawmanexact.com')
      vi.stubEnv('SMTP_PASS', 'app-password-123')
      vi.stubEnv('EMAIL_FROM', 'mail@kawmanexact.com')
      mockSendMail.mockRejectedValue(new Error('Connection refused'))
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const email = await vi.importActual<typeof import('@/lib/email')>('@/lib/email')
      const result = await email.sendEmail({
        to: 'recipient@example.com',
        subject: 'Reset',
        html: '<p>Reset</p>',
      })
      expect(result).toEqual({ delivered: false })
      const logged = errorSpy.mock.calls[0]?.[0] as string
      expect(logged).toContain('[email] ✗ SMTP send failed')
      expect(logged).toContain('Connection refused')
      errorSpy.mockRestore()
    })
  })

  describe('sendPasswordResetEmail', () => {
    it('renders the reset template and sends', async () => {
      vi.stubEnv('SMTP_HOST', 'smtp.zoho.in')
      vi.stubEnv('SMTP_PORT', '465')
      vi.stubEnv('SMTP_USER', 'mail@kawmanexact.com')
      vi.stubEnv('SMTP_PASS', 'app-password-123')
      vi.stubEnv('EMAIL_FROM', 'mail@kawmanexact.com')
      mockSendMail.mockResolvedValue({ messageId: 'id' })
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const email = await vi.importActual<typeof import('@/lib/email')>('@/lib/email')
      const result = await email.sendPasswordResetEmail(
        'user@example.com',
        'https://app.example.com/reset?token=abc',
      )
      expect(result).toEqual({ delivered: true })
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
          subject: 'Reset your Kawman ExAct password',
        }),
      )
      logSpy.mockRestore()
    })
  })
})
