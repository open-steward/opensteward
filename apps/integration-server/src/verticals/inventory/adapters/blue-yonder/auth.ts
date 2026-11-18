/**
 * Blue Yonder (JDA) auth — OAuth 2.0 client-credentials flow.
 *
 * Customers supply clientId, clientSecret, and their tenant host
 * (e.g. "acme.blueyonder.com").  The token endpoint is tenant-scoped:
 *   POST https://<tenantHost>/oauth/token
 *
 * There is no browser redirect, so the Connect page collects these through
 * `credentialFields()` — which it renders for `oauth2_cc`, not `oauth2`.
 *
 * The tenant host is typed by the customer and then receives the client secret
 * and every bearer token, so it is normalised to a bare lower-case hostname,
 * must be https, and must resolve to a public address (`assertPublicHost`)
 * before any request is sent to it.
 *
 * Tokens are short-lived; refreshCredentials re-runs the client-credentials
 * grant using the stored clientId + clientSecret from credentials.extra.
 */
import axios from 'axios'
import { assertPublicHost, customForm } from '@opensteward/shared'
import type { CredentialField, Credentials } from '@opensteward/shared'
import { getTokenUrl, SCOPES } from './constants'

const HOST_LABEL = 'Blue Yonder tenant host'

/**
 * Reduce what a customer typed for their tenant — `acme.blueyonder.com`,
 * `https://acme.blueyonder.com/wms/v1` — to the bare lower-case hostname.
 * Rejects blanks, non-https schemes, embedded credentials and non-hostnames.
 */
export function normaliseTenantHost(raw: unknown): string {
  const value = typeof raw === 'string' ? raw.trim() : ''
  if (!value) throw new Error(`${HOST_LABEL} is required (e.g. acme.blueyonder.com).`)
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    throw new Error(`${HOST_LABEL} is not a valid hostname.`)
  }
  if (url.protocol !== 'https:') throw new Error(`${HOST_LABEL} must use https.`)
  if (url.username || url.password) throw new Error(`${HOST_LABEL} must not contain credentials.`)
  const host = url.hostname.toLowerCase()
  if (!host.includes('.')) throw new Error(`${HOST_LABEL} is not a valid hostname.`)
  return host
}

const FIELDS: CredentialField[] = [
  { name: 'clientId', label: 'Client ID', type: 'text', required: true },
  { name: 'clientSecret', label: 'Client secret', type: 'password', required: true },
  {
    name: 'tenantHost',
    label: 'Tenant host',
    type: 'text',
    placeholder: 'acme.blueyonder.com',
    helpText: 'Your Blue Yonder tenant hostname. A pasted https:// URL is accepted; only the host is kept.',
    required: true,
  },
]

interface TokenResponse {
  access_token: string
  expires_in?: number
  scope?: string
}

function expiryFrom(expiresIn: number | undefined): Date | undefined {
  return typeof expiresIn === 'number' ? new Date(Date.now() + expiresIn * 1000) : undefined
}

/** Credential form: client-credentials grant against the customer's vetted tenant host. */
export const CREDENTIAL_FORM = customForm({
  fields: FIELDS,
  async exchange(input: Record<string, string>): Promise<Credentials> {
    const tenantHost = normaliseTenantHost(input['tenantHost'])
    const clientId = (input['clientId'] ?? '').trim()
    const clientSecret = input['clientSecret'] ?? ''
    if (!clientId || !clientSecret) throw new Error('Client ID and client secret are required.')

    await assertPublicHost(tenantHost)
    const tokenUrl = getTokenUrl(tenantHost)
    const res = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope: SCOPES.join(' '),
      }).toString(),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Blue Yonder token endpoint ${tokenUrl} returned ${res.status}: ${text}`)
    }
    const json = (await res.json()) as TokenResponse
    return {
      accessToken: json.access_token,
      expiresAt: expiryFrom(json.expires_in),
      scope: json.scope,
      extra: { clientId, clientSecret, tenantHost },
    }
  },
})

/** Re-run client-credentials grant to refresh an expired access token. */
export async function refreshAccessToken(
  clientId: string,
  clientSecret: string,
  tenantHost: string,
): Promise<{ accessToken: string; expiresAt?: Date }> {
  const host = normaliseTenantHost(tenantHost)
  await assertPublicHost(host)
  const { data } = await axios.post<TokenResponse>(
    getTokenUrl(host),
    new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: SCOPES.join(' '),
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' } },
  )
  return { accessToken: data.access_token, expiresAt: expiryFrom(data.expires_in) }
}
