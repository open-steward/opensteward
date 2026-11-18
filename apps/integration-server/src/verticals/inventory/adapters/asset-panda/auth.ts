/**
 * Asset Panda authentication.
 *
 * The v3 token endpoint, POST /v3/session/token, takes the e-mail and password
 * of an Asset Panda user and returns a Bearer token
 * (https://team-asset-panda.readme.io/reference/post_v3-session-token.md):
 * "you'll need to enter the e-mail and password you would use to log into your
 * account ... It is recommended to create a service account used for creating
 * your token." The same page says a password change in the web app requires
 * the token to be refreshed. There is no browser authorization flow, so the
 * platform is labelled `basic` and connects through credentialFields().
 *
 * The page documents no response body; the token is read from `token` or
 * `access_token`, whichever is present.
 */
import axios from 'axios'
import type { Credentials, CredentialField } from '@opensteward/shared'
import { TOKEN_URL } from './constants'

export function getAuthUrl(_state: string, _scopes?: string[]): string {
  throw new Error('asset-panda signs in with a user e-mail + password; no browser auth URL')
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'email',
      label: 'E-mail',
      type: 'text',
      required: true,
      helpText: 'E-mail of the Asset Panda user (a dedicated service account is recommended).',
    },
    { name: 'password', label: 'Password', type: 'password', required: true },
  ]
}

interface TokenResponse {
  token?: string
  access_token?: string
  expires_in?: number
  [key: string]: unknown
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const email = fields['email']
  const password = fields['password']
  if (!email || !password) {
    throw new Error('asset-panda credentialFields require email + password')
  }
  const { data } = await axios.post<TokenResponse>(
    TOKEN_URL,
    { email, password },
    { headers: { 'Content-Type': 'application/json', Accept: 'application/json' } },
  )
  const token = data.token ?? data.access_token ?? ''
  if (!token) throw new Error('asset-panda: no token returned from session/token endpoint')
  const expiresIn = typeof data.expires_in === 'number' ? data.expires_in : 3600
  return {
    accessToken: token,
    expiresAt: new Date(Date.now() + expiresIn * 1000),
    extra: { email, password },
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const email = String(credentials.extra?.['email'] ?? '')
  const password = String(credentials.extra?.['password'] ?? '')
  if (!email || !password) return credentials
  return exchangeCredentials({ email, password })
}
