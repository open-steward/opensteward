/**
 * Refrens authentication helpers.
 *
 * Refrens uses a JWT-based auth flow: the caller exchanges appId + appSecret
 * for a short-lived JWT via POST /authentication, then sends that JWT as
 * `Authorization: Bearer <jwt>` on subsequent requests.
 *
 * The urlKey (business identifier) is stored alongside the credentials so
 * the client can scope all requests to /businesses/:urlKey/.
 *
 * For the Connect Link form we expose simpleApiKey with a custom field set
 * so the end-user can supply appId, appSecret, and urlKey.
 */

import axios from 'axios'
import { customForm } from '@opensteward/shared'
import type { Credentials } from '../../adapter/interface'
import { REFRENS_API_BASE, REFRENS_AUTH_PATH } from './constants'

// ── credential form (non-OAuth Connect Link) ──────────────────────────────────

/**
 * Three-field form: appId, appSecret (password), urlKey.
 * On submit, exchanges appId + appSecret for a JWT and stores all three in
 * credentials so the client can re-authenticate when the token expires.
 */
export const REFRENS_CREDENTIAL_FORM = customForm({
  fields: [
    { name: 'appId', label: 'App ID', type: 'text', required: true },
    {
      name: 'appSecret',
      label: 'App secret',
      type: 'password',
      required: true,
      helpText: 'Found in Business Settings > Integration > Accounting Integration > Generate API Keys.',
    },
    {
      name: 'urlKey',
      label: 'Business URL key',
      type: 'text',
      required: true,
      helpText: 'The URL key for your Refrens business, shown in the same API Keys panel.',
    },
  ],
  async exchange(fields) {
    const appId = (fields['appId'] ?? '').trim()
    const appSecret = (fields['appSecret'] ?? '').trim()
    const urlKey = (fields['urlKey'] ?? '').trim()
    if (!appId || !appSecret || !urlKey) {
      throw new Error('App ID, App secret, and Business URL key are all required.')
    }
    const jwt = await fetchJwt(appId, appSecret)
    return {
      accessToken: jwt,
      extra: { appId, appSecret, urlKey },
    }
  },
})

// ── JWT fetch / refresh ───────────────────────────────────────────────────────

interface RefrensAuthResponse {
  accessToken: string
  name?: string
  appId?: string
}

/**
 * Exchange appId + appSecret for a Refrens JWT.
 */
export async function fetchJwt(appId: string, appSecret: string): Promise<string> {
  const { data } = await axios.post<RefrensAuthResponse>(
    `${REFRENS_API_BASE}${REFRENS_AUTH_PATH}`,
    { strategy: 'app-secret', appId, appSecret },
    { headers: { 'Content-Type': 'application/json' } },
  )
  const token = data?.accessToken
  if (!token) throw new Error('Refrens auth response did not contain an accessToken.')
  return token
}

/**
 * Re-fetch a fresh JWT using stored appId + appSecret from credentials.extra.
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const extra = credentials.extra ?? {}
  const appId = (extra['appId'] as string | undefined) ?? ''
  const appSecret = (extra['appSecret'] as string | undefined) ?? ''
  if (!appId || !appSecret) {
    throw new Error('Cannot refresh Refrens credentials: appId or appSecret is missing from stored credentials.')
  }
  const jwt = await fetchJwt(appId, appSecret)
  return { ...credentials, accessToken: jwt }
}

// The platform does not use OAuth redirect flows, so these are no-ops kept
// to satisfy the BaseAdapter interface.
export function getAuthUrl(_state: string): string {
  return ''
}

export async function exchangeCode(_code: string): Promise<Credentials> {
  throw new Error('Refrens uses API-key credentials, not an OAuth code flow. Use credentialFields / exchangeCredentials instead.')
}
