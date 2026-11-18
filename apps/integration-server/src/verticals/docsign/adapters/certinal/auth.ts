/**
 * Certinal eSign credential handling — per-tenant OAuth2 client credentials.
 *
 * "Certinal eSign supports the OAuth2 Client Credentials Grant to generate
 * your access token." The customer logs in to Certinal eSign, opens the More
 * tab, clicks Create Custom Integration and copies the Client ID, Secret and
 * API URL. https://certinal.stoplight.io/docs/api/b6b6c2d4906e9-authentication
 *
 * Token request (rendered 2026-09-28 from
 * https://certinal.stoplight.io/docs/api/0bc4fc4f90ef6-o-auth-2-0-client-credentials-grant-flow-api
 * and https://certinal.stoplight.io/docs/api/q8v4vixymc0m7-o-auth-2-0-client-credentials-grant-flow-api):
 *
 *   POST {apiUrl}/auth/v1/token?grant_type=client_credentials
 *   Authorization: Basic base64(clientId:clientSecret)      ("Security: Basic Auth")
 *   Content-Type: application/x-www-form-urlencoded
 *   user_email=<API user email; the API user must have the Sender role>   (required)
 *
 * Response fields: access_token, token_type ("bearer"), expires_in,
 * refresh_token, api_access_point ("API access end point to make API calls").
 *
 * The refresh_token grant is listed as an allowed `grant_type` value, but the
 * pages do not document which body field carries the refresh token, so
 * `refreshCredentials` re-mints with client_credentials from the inputs kept
 * on `credentials.extra` instead of guessing.
 *
 * The API URL is customer-supplied and receives the client secret, so it is
 * reduced to an https origin, the host is checked with `assertPublicHost`
 * (private/reserved addresses are refused) and redirects are refused, so the
 * Basic client secret is only ever sent to the entered host.
 */

import {
  assertPublicHost,
  customForm,
  type CredentialField,
  type Credentials,
} from '@opensteward/shared'
import { TOKEN_PATH } from './constants'

const FIELDS: CredentialField[] = [
  {
    name: 'apiUrl',
    label: 'API URL',
    type: 'url',
    required: true,
    placeholder: 'https://esign-staging.certinal.com',
    helpText:
      'The API URL shown on your Certinal Custom Integration (More tab → Create Custom Integration).',
  },
  {
    name: 'clientId',
    label: 'Client ID',
    type: 'text',
    required: true,
    helpText: 'The Client ID of your Certinal Custom Integration.',
  },
  {
    name: 'clientSecret',
    label: 'Client secret',
    type: 'password',
    required: true,
    helpText: 'The Secret of your Certinal Custom Integration.',
  },
  {
    name: 'userEmail',
    label: 'API user email',
    type: 'email',
    required: true,
    placeholder: 'api@example.com',
    helpText: 'Email address of the Certinal API user. That user must have the Sender role.',
  },
]

/** Inputs needed to mint a token; kept on `credentials.extra` so refresh can re-mint. */
export interface CertinalAuthInputs {
  apiUrl: string
  clientId: string
  clientSecret: string
  userEmail: string
}

interface CertinalTokenResponse {
  access_token?: string
  token_type?: string
  expires_in?: number
  refresh_token?: string
  api_access_point?: string
}

/**
 * Reduce a customer-typed Certinal address to its https origin — the adapter
 * appends `/auth/v1/token` and `/rssp/v1/...` itself. Rejects blanks,
 * non-https schemes and embedded credentials.
 */
export function normaliseApiUrl(raw: string | undefined | null): string {
  const s = (raw ?? '').trim()
  if (!s) throw new Error('Certinal API URL is required (copy it from your Custom Integration).')
  let url: URL
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`)
  } catch {
    throw new Error('Certinal API URL must be a valid https:// URL.')
  }
  if (url.protocol !== 'https:') throw new Error('Certinal API URL must use https://.')
  if (url.username || url.password) {
    throw new Error('Certinal API URL must not contain a username or password.')
  }
  if (!url.hostname) throw new Error('Certinal API URL must be a valid https:// URL.')
  return url.origin
}

/**
 * `expires_in` is documented two ways: the reference page describes it as
 * "Access token expiry time. Format epoch in millis" (example 1643699611236),
 * the Quick-Start page's example is 3600. Both are handled: a value that can
 * only be an epoch-millis timestamp is used as-is, anything smaller is read as
 * seconds from now.
 */
export function expiresAtFrom(expiresIn: unknown, now: number = Date.now()): Date | undefined {
  if (typeof expiresIn !== 'number' || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    return undefined
  }
  return expiresIn > 1e11 ? new Date(expiresIn) : new Date(now + expiresIn * 1000)
}

function readInputs(fields: Record<string, string | undefined> | undefined): CertinalAuthInputs {
  const apiUrl = normaliseApiUrl(fields?.['apiUrl'])
  const clientId = (fields?.['clientId'] ?? '').trim()
  const clientSecret = fields?.['clientSecret'] ?? ''
  const userEmail = (fields?.['userEmail'] ?? '').trim()
  if (!clientId || !clientSecret) throw new Error('Client ID and client secret are required.')
  if (!userEmail) throw new Error('API user email is required.')
  return { apiUrl, clientId, clientSecret, userEmail }
}

/** Run the client_credentials grant against the tenant host and build Credentials. */
export async function mintToken(inputs: CertinalAuthInputs): Promise<Credentials> {
  const url = `${inputs.apiUrl}${TOKEN_PATH}?grant_type=client_credentials`
  const basic = Buffer.from(`${inputs.clientId}:${inputs.clientSecret}`, 'utf8').toString('base64')
  // Not `safeFetch`: it follows redirects with the same init, which would
  // replay the Basic client secret to whatever host (or http:// URL) a
  // Location header names. Check the host, then refuse any redirect.
  await assertPublicHost(new URL(url).hostname.replace(/^\[|\]$/g, ''))
  const res = await fetch(url, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      authorization: `Basic ${basic}`,
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
    },
    body: new URLSearchParams({ user_email: inputs.userEmail }).toString(),
  })
  if (res.status >= 300 && res.status < 400) {
    throw new Error(
      `Certinal token endpoint redirected (${res.status}); check the API URL on your Custom Integration.`,
    )
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Certinal token endpoint returned ${res.status}: ${text.slice(0, 300)}`)
  }
  const json = (await res.json()) as CertinalTokenResponse
  if (!json.access_token) throw new Error('Certinal token endpoint returned no access_token.')

  // `api_access_point` is where API calls go; fall back to the API URL the
  // customer entered. It passes the same https/origin check either way.
  let apiBaseUrl = inputs.apiUrl
  if (json.api_access_point) {
    try {
      apiBaseUrl = normaliseApiUrl(json.api_access_point)
    } catch {
      apiBaseUrl = inputs.apiUrl
    }
  }

  return {
    accessToken: json.access_token,
    ...(json.refresh_token ? { refreshToken: json.refresh_token } : {}),
    expiresAt: expiresAtFrom(json.expires_in),
    extra: {
      apiUrl: inputs.apiUrl,
      apiBaseUrl,
      clientId: inputs.clientId,
      clientSecret: inputs.clientSecret,
      userEmail: inputs.userEmail,
    },
  }
}

export const CertinalCredentialForm = customForm({
  fields: FIELDS,
  async exchange(input) {
    return mintToken(readInputs(input))
  },
})

/** Re-mint from the inputs stored on `credentials.extra` at connect time. */
export async function refreshCertinalCredentials(credentials: Credentials): Promise<Credentials> {
  const extra = credentials.extra ?? {}
  const str = (k: string): string => (typeof extra[k] === 'string' ? (extra[k] as string) : '')
  if (!str('apiUrl') || !str('clientId') || !str('clientSecret') || !str('userEmail')) {
    throw new Error(
      'Certinal connection lacks the stored client credentials needed to refresh; reconnect it with the Custom Integration Client ID, Secret and API URL.',
    )
  }
  return mintToken(
    readInputs({
      apiUrl: str('apiUrl'),
      clientId: str('clientId'),
      clientSecret: str('clientSecret'),
      userEmail: str('userEmail'),
    }),
  )
}
