/**
 * Skribble auth helpers.
 *
 * Skribble's API uses an oauth2_cc-style server-to-server flow: the
 * customer supplies a `username` (workspace login) plus an `api-key`
 * (issued from Skribble's developer console). The adapter POSTs both to
 * `/v2/access/login`, which returns a short-lived JWT to use as a bearer
 * token on all subsequent calls.
 *
 * There is no interactive authorization-code flow, so `getAuthUrl()`
 * throws and credential collection is wired through `credentialFields()`
 * + `exchangeCredentials()` on the adapter class.
 */
import axios from 'axios'
import type { Credentials, CredentialField } from '@opensteward/shared'
import { LOGIN_URL } from './constants'

export const SKRIBBLE_CREDENTIAL_FIELDS: CredentialField[] = [
  {
    name: 'username',
    label: 'Skribble username',
    type: 'text',
    placeholder: 'jane.doe@acme.eu',
    helpText:
      'Your Skribble login (the email/handle you sign in to skribble.com with).',
    required: true,
  },
  {
    name: 'apiKey',
    label: 'API key',
    type: 'password',
    helpText:
      'Generated in Skribble Workspace settings → API. Paired with your username it mints a short-lived JWT.',
    required: true,
  },
]

interface SkribbleLoginResponse {
  /** Skribble returns the JWT as a bare string body, but some
   *  proxies wrap it as JSON. We accept either. */
  access_token?: string
  token?: string
}

export async function loginForJwt(username: string, apiKey: string): Promise<string> {
  const { data } = await axios.post<SkribbleLoginResponse | string>(
    LOGIN_URL,
    { username, 'api-key': apiKey },
    { headers: { 'Content-Type': 'application/json', Accept: 'application/json' } },
  )
  if (typeof data === 'string') return data
  const token = data.access_token ?? data.token
  if (!token) throw new Error('Skribble login: no token in response')
  return token
}

export async function exchangeSkribbleCredentials(
  fields: Record<string, string>,
): Promise<Credentials> {
  const username = (fields.username ?? '').trim()
  const apiKey = (fields.apiKey ?? '').trim()
  if (!username) throw new Error('Skribble username is required.')
  if (!apiKey) throw new Error('Skribble API key is required.')
  const jwt = await loginForJwt(username, apiKey)
  return {
    accessToken: jwt,
    // Skribble JWTs typically live for hours; re-login on demand by
    // re-running `exchangeCredentials`. Store the originals so refresh
    // can re-mint without a fresh user interaction.
    extra: { username, apiKey },
  }
}

export async function refreshSkribbleCredentials(
  credentials: Credentials,
): Promise<Credentials> {
  const username = String(credentials.extra?.['username'] ?? '')
  const apiKey = String(credentials.extra?.['apiKey'] ?? '')
  if (!username || !apiKey) return credentials
  const jwt = await loginForJwt(username, apiKey)
  return {
    ...credentials,
    accessToken: jwt,
    extra: { ...(credentials.extra ?? {}), username, apiKey },
  }
}
