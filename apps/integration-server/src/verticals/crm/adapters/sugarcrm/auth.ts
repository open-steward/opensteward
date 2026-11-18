/**
 * SugarCRM authentication helpers.
 *
 * SugarCRM's REST token endpoint (`POST {instance}/rest/v11_1/oauth2/token`)
 * grants only `password` and `refresh_token` — there is no browser
 * authorization-code flow. A connection is a login on the customer's own
 * instance: the Connect page collects the instance URL, username and password
 * (plus an optional OAuth key and platform), the password grant mints an
 * access + refresh token pair, and the instance URL and client are kept in
 * `credentials.extra` so refresh and API calls go back to the same instance.
 * The password itself is not stored.
 *
 * The instance URL is free-form (sugarondemand.com or self-hosted) and receives
 * the password, so it is normalised, must be https, and must resolve to a
 * public address before any token request.
 *
 * Docs: https://support.sugarcrm.com/documentation/sugar_developer/sugar_developer_guide_25.1/integration/web_services/rest_api/endpoints/oauth2token_post/
 */

import { assertPublicHost, type CredentialField, type Credentials } from '@opensteward/shared'
import { API_BASE_PATH } from './constants'

/** Sugar's built-in OAuth client, available on every instance. */
const DEFAULT_CLIENT_ID = 'sugar'
/** Sugar's standard platform. A custom platform must be registered in Admin > Platforms. */
const DEFAULT_PLATFORM = 'base'

export const SUGAR_NO_AUTHORIZATION_CODE_FLOW =
  'SugarCRM does not support the OAuth authorization-code flow; connect with a username and password instead.'

export const SUGAR_CREDENTIAL_FIELDS: CredentialField[] = [
  {
    name: 'instanceUrl',
    label: 'SugarCRM URL',
    type: 'url',
    required: true,
    placeholder: 'https://yourcompany.sugarondemand.com',
    helpText: 'The https:// address you use to open SugarCRM.',
  },
  { name: 'username', label: 'Username', type: 'text', required: true },
  { name: 'password', label: 'Password', type: 'password', required: true },
  {
    name: 'clientId',
    label: 'OAuth key',
    type: 'text',
    required: false,
    placeholder: DEFAULT_CLIENT_ID,
    helpText: 'Leave blank to use Sugar’s built-in "sugar" client, or enter a key from Admin > OAuth Keys.',
  },
  {
    name: 'clientSecret',
    label: 'OAuth secret',
    type: 'password',
    required: false,
    helpText: 'Only needed with a custom OAuth key.',
  },
  {
    name: 'platform',
    label: 'Platform',
    type: 'text',
    required: false,
    placeholder: DEFAULT_PLATFORM,
    helpText: 'Leave blank for "base". A platform registered in Admin > Platforms keeps this login from ending the user’s web session.',
  },
]

/**
 * Reduce a customer-typed SugarCRM address to the instance root the adapter
 * appends `/rest/...` to: `acme.sugarondemand.com` →
 * `https://acme.sugarondemand.com`; `https://crm.example.com/sugar/rest/v11_1/Contacts`
 * → `https://crm.example.com/sugar`; `…/index.php?module=Home` → the root.
 * Rejects blanks, non-https schemes and embedded credentials with a message
 * naming the problem.
 */
export function normaliseInstanceUrl(raw: string | undefined | null): string {
  const s = (raw ?? '').trim()
  if (!s) {
    throw new Error('SugarCRM instance URL is required (e.g. https://yourcompany.sugarondemand.com).')
  }
  let url: URL
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`)
  } catch {
    throw new Error('SugarCRM instance URL must be a valid https:// URL.')
  }
  if (url.protocol !== 'https:') throw new Error('SugarCRM instance URL must use https://.')
  if (url.username || url.password) {
    throw new Error('SugarCRM instance URL must not contain a username or password.')
  }
  const path = url.pathname.replace(/\/(?:index\.php|rest)(?:\/.*)?$/i, '').replace(/\/+$/, '')
  return `${url.origin}${path}`
}

interface SugarTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
}

/**
 * POST to the instance's token endpoint. The body carries the password or a
 * refresh token, so the host must resolve to a public address first.
 */
async function requestToken(
  instanceUrl: string,
  body: Record<string, string>,
  failure: string,
): Promise<SugarTokenResponse> {
  await assertPublicHost(new URL(instanceUrl).hostname)
  const res = await fetch(`${instanceUrl}${API_BASE_PATH}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`${failure}: ${text}`)
  }

  return (await res.json()) as SugarTokenResponse
}

function expiryFrom(expiresIn: number | undefined): Date | undefined {
  return expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined
}

/** Run the password grant on the customer's instance (the Connect Link form submit). */
export async function exchangePassword(fields: Record<string, string>): Promise<Credentials> {
  const instanceUrl = normaliseInstanceUrl(fields['instanceUrl'])
  const username = (fields['username'] ?? '').trim()
  const password = fields['password'] ?? ''
  if (!username || !password) throw new Error('SugarCRM username and password are required.')
  const clientId = (fields['clientId'] ?? '').trim() || DEFAULT_CLIENT_ID
  const clientSecret = fields['clientSecret'] ?? ''
  const platform = (fields['platform'] ?? '').trim() || DEFAULT_PLATFORM

  const json = await requestToken(
    instanceUrl,
    {
      grant_type: 'password',
      client_id: clientId,
      client_secret: clientSecret,
      username,
      password,
      platform,
    },
    'SugarCRM login failed',
  )

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: expiryFrom(json.expires_in),
    extra: { instanceUrl, clientId, clientSecret, platform },
  }
}

/**
 * Refresh on the instance and client stored with the credentials; the
 * deployment-level values are only a fallback for credentials minted before
 * those were recorded.
 */
export async function refreshToken(
  fallback: { clientId?: string; clientSecret?: string; instanceUrl?: string },
  credentials: Credentials,
): Promise<Credentials> {
  if (!credentials.refreshToken) return credentials

  const extra = credentials.extra ?? {}
  const stored = (key: string): string | undefined =>
    typeof extra[key] === 'string' ? (extra[key] as string) : undefined
  const instanceUrl = normaliseInstanceUrl(stored('instanceUrl') ?? fallback.instanceUrl)

  const json = await requestToken(
    instanceUrl,
    {
      grant_type: 'refresh_token',
      refresh_token: credentials.refreshToken,
      client_id: stored('clientId') ?? fallback.clientId ?? DEFAULT_CLIENT_ID,
      client_secret: stored('clientSecret') ?? fallback.clientSecret ?? '',
      platform: stored('platform') ?? DEFAULT_PLATFORM,
    },
    'SugarCRM token refresh failed',
  )

  return {
    ...credentials,
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? credentials.refreshToken,
    expiresAt: expiryFrom(json.expires_in),
    extra: { ...extra, instanceUrl },
  }
}
