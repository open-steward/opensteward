/**
 * Spree Commerce auth helpers.
 *
 * Spree supports two auth strategies:
 *
 *  1. **OAuth2 (Doorkeeper)** — `POST /spree_oauth/token` with
 *     `grant_type=authorization_code` or `grant_type=client_credentials`.
 *     Returns `{ access_token, token_type, expires_in, refresh_token, created_at }`.
 *
 *  2. **API key (bearer token)** — generated in Spree admin under
 *     Users → API Access. Passed as `Authorization: Bearer {token}`.
 *
 * This adapter supports both: if `clientId` + `clientSecret` are present
 * in credentials.extra it runs the OAuth2 flow; otherwise it falls back
 * to the static bearer token in `accessToken`.
 *
 * Connect Link collects the store URL, client ID and secret on the credential
 * form and runs the `client_credentials` grant with `scope=admin`, which is
 * what the Platform API requires. The store URL is the customer's and receives
 * the client secret, so it is normalised to an https origin and checked
 * against private address space before every token request.
 */

import axios from 'axios'
import type { CredentialField, Credentials } from '@opensteward/shared'
import { assertPublicHost } from '@opensteward/shared'
import { TOKEN_LIFETIME_MS } from './constants'

/**
 * Reduce whatever the customer typed to the store origin: `shop.example.com`,
 * `https://Shop.Example.com/`, and a pasted admin URL all become
 * `https://shop.example.com`. Rejects blanks, non-URLs, and anything but https.
 */
export function normaliseStoreUrl(raw: string | undefined | null): string {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) throw new Error('Spree store URL is required (e.g. https://shop.example.com).')
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    throw new Error('Spree store URL is not a valid URL.')
  }
  if (url.protocol !== 'https:') throw new Error('Spree store URL must use https://.')
  if (!url.hostname) throw new Error('Spree store URL is not a valid URL.')
  return url.origin
}

/** Token requests carry the client secret: never to a private address. */
async function assertStoreIsPublic(baseUrl: string): Promise<void> {
  await assertPublicHost(new URL(baseUrl).hostname.replace(/^\[|\]$/g, ''))
}

export const CREDENTIAL_FIELDS: CredentialField[] = [
  {
    name: 'baseUrl',
    label: 'Spree store URL',
    type: 'url',
    required: true,
    placeholder: 'https://shop.example.com',
    helpText: 'The address your Spree store is served from.',
  },
  {
    name: 'clientId',
    label: 'Client ID',
    type: 'text',
    required: true,
    helpText: 'The client ID of an OAuth application created in your Spree admin.',
  },
  { name: 'clientSecret', label: 'Client secret', type: 'password', required: true },
]

interface ClientCredentialsTokenResponse {
  access_token: string
  token_type: string
  expires_in?: number
  refresh_token?: string
}

/** `client_credentials` with `scope=admin` against the store's own token endpoint. */
export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const baseUrl = normaliseStoreUrl(fields?.['baseUrl'])
  const clientId = (fields?.['clientId'] ?? '').trim()
  const clientSecret = fields?.['clientSecret'] ?? ''
  if (!clientId || !clientSecret) {
    throw new Error('Spree client ID and client secret are required.')
  }
  await assertStoreIsPublic(baseUrl)
  const res = await axios.post<ClientCredentialsTokenResponse>(
    `${baseUrl}/spree_oauth/token`,
    {
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'admin',
    },
    {
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      timeout: 30_000,
    },
  )
  const expiresIn = res.data.expires_in ?? TOKEN_LIFETIME_MS / 1000
  return {
    accessToken: res.data.access_token,
    refreshToken: res.data.refresh_token,
    expiresAt: new Date(Date.now() + expiresIn * 1000),
    extra: { baseUrl, clientId, clientSecret },
  }
}

export function buildAuthUrl(baseUrl: string, clientId: string, state: string): string {
  const url = new URL('/spree_oauth/authorize', baseUrl)
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('state', state)
  return url.toString()
}

export async function exchangeCode(
  baseUrl: string,
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  const url = `${baseUrl.replace(/\/$/, '')}/spree_oauth/token`
  const res = await axios.post<{
    access_token: string
    token_type: string
    expires_in?: number
    refresh_token?: string
    created_at?: number
  }>(url, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  }, {
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    timeout: 30_000,
  })

  const data = res.data
  const expiresIn = data.expires_in ?? TOKEN_LIFETIME_MS / 1000
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + expiresIn * 1000),
    extra: { baseUrl, clientId, clientSecret },
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const baseUrl = credentials.extra?.['baseUrl'] as string | undefined
  const clientId = credentials.extra?.['clientId'] as string | undefined
  const clientSecret = credentials.extra?.['clientSecret'] as string | undefined
  const refreshToken = credentials.refreshToken

  if (!baseUrl) {
    throw new Error('Spree refreshCredentials requires baseUrl in credentials.extra')
  }

  // If we have OAuth2 credentials, use refresh_token or client_credentials
  if (clientId && clientSecret) {
    const storeUrl = normaliseStoreUrl(baseUrl)
    await assertStoreIsPublic(storeUrl)
    const url = `${storeUrl}/spree_oauth/token`
    const body: Record<string, string> = refreshToken
      ? {
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: clientId,
          client_secret: clientSecret,
        }
      : {
          grant_type: 'client_credentials',
          client_id: clientId,
          client_secret: clientSecret,
          scope: 'admin',
        }

    const res = await axios.post<{
      access_token: string
      token_type: string
      expires_in?: number
      refresh_token?: string
    }>(url, body, {
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      timeout: 30_000,
    })

    const data = res.data
    const expiresIn = data.expires_in ?? TOKEN_LIFETIME_MS / 1000
    return {
      ...credentials,
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? credentials.refreshToken,
      expiresAt: new Date(Date.now() + expiresIn * 1000),
    }
  }

  // Static API key — nothing to refresh, just return as-is
  return credentials
}
