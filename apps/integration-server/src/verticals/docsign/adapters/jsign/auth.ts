/**
 * jSign auth helpers.
 *
 * jSign authenticates via Bearer tokens (JWT). The adapter collects the
 * user's email and password via the Connect Link credential form, then
 * exchanges them for a JWT by POSTing to /api/v2/Authorization/token.
 * The token is stored as `credentials.accessToken`.
 *
 * There is no standard OAuth Authorization-Code Grant; `getAuthUrl` /
 * `exchangeCode` (OAuth callbacks) are not supported and will throw.
 * Use `credentialFields()` / `exchangeCredentials()` instead.
 *
 * Docs: https://api.jsign.com/
 */
import axios from 'axios'
import type { Credentials, CredentialField } from '@opensteward/shared'
import { TOKEN_URL, REFRESH_TOKEN_URL, APP_AUTH_TYPE_HEADER, APP_AUTH_TYPE_VALUE } from './constants'

interface JsignTokenResponse {
  token?: string
  refresh_token?: string
  /** seconds until expiry, if returned */
  expires_in?: number
}

/** Credential form fields shown in Connect Link. */
export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'email',
      label: 'jSign email',
      type: 'text' as const,
      placeholder: 'you@example.com',
      helpText: 'The email address for your jSign account.',
      required: true,
    },
    {
      name: 'password',
      label: 'jSign password',
      type: 'password' as const,
      placeholder: '••••••••',
      helpText: 'The password for your jSign account.',
      required: true,
    },
  ]
}

/** Exchange email+password for a Bearer token. */
export async function exchangeCredentials(
  fields: Record<string, string>,
): Promise<Credentials> {
  const { data } = await axios.post<JsignTokenResponse>(
    TOKEN_URL,
    { email: fields['email'] ?? '', password: fields['password'] ?? '' },
    {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        [APP_AUTH_TYPE_HEADER]: APP_AUTH_TYPE_VALUE,
      },
    },
  )
  const token = data.token ?? ''
  const expiresIn = typeof data.expires_in === 'number' ? data.expires_in : 3600
  return {
    accessToken: token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + expiresIn * 1000),
    extra: { email: fields['email'] ?? '' },
  }
}

/** Refresh an existing token using the refresh_token. */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  if (!credentials.refreshToken) return credentials
  try {
    const { data } = await axios.post<JsignTokenResponse>(
      REFRESH_TOKEN_URL,
      { token: credentials.accessToken, refresh_token: credentials.refreshToken },
      {
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          [APP_AUTH_TYPE_HEADER]: APP_AUTH_TYPE_VALUE,
        },
      },
    )
    const token = data.token ?? credentials.accessToken
    const expiresIn = typeof data.expires_in === 'number' ? data.expires_in : 3600
    return {
      accessToken: token,
      refreshToken: data.refresh_token ?? credentials.refreshToken,
      expiresAt: new Date(Date.now() + expiresIn * 1000),
      extra: credentials.extra ?? {},
    }
  } catch {
    return credentials
  }
}
