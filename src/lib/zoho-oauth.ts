import 'server-only'
import { genericOAuth } from 'better-auth/plugins'
import type { GenericOAuthConfig, GenericOAuthUserInfo } from 'better-auth/plugins'

/**
 * Maps Zoho's userinfo response to the standard OAuth user fields
 * that better-auth expects.
 *
 * Zoho returns `ZUID` (unique ID), `Email`, `Display_Name`, `First_Name`,
 * `Last_Name`. We map ZUID→id, Email→email (lowercased), Display_Name→name,
 * and set emailVerified to true (Zoho's `Email` is from a verified mailbox).
 *
 * Returns null when the email does not end with `@${allowedDomain}`,
 * which is the company-domain gate enforced by `getUserInfo`.
 */
export function mapZohoUserInfo(
  raw: Record<string, unknown>,
  allowedDomain: string,
): GenericOAuthUserInfo | null {
  const email = String(raw.Email ?? '').toLowerCase().trim()
  if (!email || !email.endsWith(`@${allowedDomain}`)) return null
  return {
    id: String(raw.ZUID ?? ''),
    email,
    emailVerified: true,
    name: String(raw.Display_Name ?? raw.First_Name ?? ''),
  }
}

/**
 * Builds the generic-oauth config for the "zoho" provider.
 * Returns null when ZOHO_CLIENT_ID / ZOHO_CLIENT_SECRET are not set so the
 * plugin is only registered when fully configured.
 */
export function buildZohoOAuthConfig(): GenericOAuthConfig<'zoho'> | null {
  const clientId = process.env.ZOHO_CLIENT_ID
  const clientSecret = process.env.ZOHO_CLIENT_SECRET
  if (!clientId || !clientSecret) return null

  const accountsUrl = (process.env.ZOHO_ACCOUNTS_URL || 'https://accounts.zoho.in').replace(/\/$/, '')
  const allowedDomain = process.env.ALLOWED_EMAIL_DOMAIN || 'kawmanexact.com'

  return {
    providerId: 'zoho',
    authorizationUrl: `${accountsUrl}/oauth/v2/auth`,
    tokenUrl: `${accountsUrl}/oauth/v2/token`,
    userInfoUrl: `${accountsUrl}/oauth/user/info`,
    clientId,
    clientSecret,
    scopes: ['openid', 'email', 'profile'],
    pkce: false,
    disableSignUp: true,
    getUserInfo: async (tokens) => {
      if (!tokens?.accessToken) return null
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10_000)
      let res: Response
      try {
        res = await fetch(`${accountsUrl}/oauth/user/info`, {
          method: 'GET',
          headers: { Authorization: `Zoho-oauthtoken ${tokens.accessToken}` },
          signal: controller.signal,
        })
      } finally {
        clearTimeout(timeout)
      }
      if (!res.ok) return null
      const raw = (await res.json()) as Record<string, unknown>
      return mapZohoUserInfo(raw, allowedDomain)
    },
  }
}

/**
 * Builds the list of generic-oauth plugins. Returns an empty array when
 * ZOHO_CLIENT_ID / ZOHO_CLIENT_SECRET are not set, so the app runs
 * exactly as before (no Zoho provider registered).
 */
export function zohoOAuthPlugins() {
  const config = buildZohoOAuthConfig()
  if (!config) return []
  return [genericOAuth({ config: [config] })]
}
