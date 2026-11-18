/**
 * Firefly III auth helpers.
 *
 * Firefly III is self-hosted, so every endpoint is relative to the customer's
 * own installation. OAuth clients are created inside each installation
 * (Profile → OAuth), which means a deployment-wide client id only works
 * against one server; customers therefore connect with their server URL and a
 * Personal Access Token (`exchangePersonalAccessToken`). The OAuth
 * authorization_code helpers remain for a deployment that configures its own
 * single server.
 *
 * Storage: `credentials.extra.instanceUrl` (and `tenantId`, for connections
 * made before `extra` was used) holds the normalised server URL.
 *
 * The server receives bearer tokens and the client secret, so its host is
 * resolved and refused if it points at a private/reserved address before any
 * request. There is no fallback host.
 *
 * Docs: https://docs.firefly-iii.org/how-to/firefly-iii/features/api/
 */

import axios from 'axios'
import { FIREFLY_API_PATH, FIREFLY_OAUTH_AUTHORIZE_PATH, FIREFLY_OAUTH_TOKEN_PATH } from './constants'
import type { Credentials } from '../../adapter/interface'
import { assertPublicHost, basicAuth, parseTokenResponse } from '@opensteward/shared'

/**
 * Reduce whatever a customer typed for their server to `https://host[/path]`:
 * trims, lowercases the host, assumes https when no scheme was typed, and
 * drops query, fragment and trailing slashes. The path is kept because
 * Firefly III is often served under a sub-path behind a reverse proxy.
 */
export function normaliseInstanceUrl(raw: string | undefined | null): string {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) throw new Error('Firefly III URL is required (e.g. https://firefly.example.com).')
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    throw new Error('Firefly III URL is not a valid URL.')
  }
  if (url.protocol !== 'https:') throw new Error('Firefly III URL must use https.')
  if (url.username || url.password) {
    throw new Error('Firefly III URL must not contain a username or password.')
  }
  return `https://${url.host}${url.pathname.replace(/\/+$/, '')}`
}

async function assertInstancePublic(instanceUrl: string): Promise<void> {
  await assertPublicHost(new URL(instanceUrl).hostname.replace(/^\[|\]$/g, ''))
}

/** Server URL recorded with the credentials; `tenantId` held it before `extra` did. */
export function storedInstanceUrl(
  credentials: Pick<Credentials, 'tenantId' | 'extra'>,
): string | undefined {
  const stored = credentials.extra?.['instanceUrl']
  if (typeof stored === 'string' && stored.trim()) return stored
  return credentials.tenantId?.trim() || undefined
}

/**
 * Validate a Personal Access Token against the customer's server and return
 * the credentials to persist.
 */
export async function exchangePersonalAccessToken(fields: Record<string, string>): Promise<Credentials> {
  const instanceUrl = normaliseInstanceUrl(fields['instanceUrl'])
  const token = (fields['personalAccessToken'] ?? '').trim()
  if (!token) throw new Error('Firefly III personal access token is required.')
  await assertInstancePublic(instanceUrl)
  try {
    await axios.get(`${instanceUrl}${FIREFLY_API_PATH}/about/user`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.api+json' },
    })
  } catch (err) {
    const status = (err as { response?: { status?: number } }).response?.status
    if (status === 401 || status === 403) {
      throw new Error(`Firefly III rejected the personal access token (HTTP ${status}).`, { cause: err })
    }
    throw err
  }
  return { accessToken: token, tenantId: instanceUrl, extra: { instanceUrl } }
}

export function buildAuthUrl(
  clientId: string,
  redirectUri: string,
  instanceHost: string | undefined,
  scopes: string[],
  state: string,
): string {
  const host = normaliseInstanceUrl(instanceHost)
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
  })
  if (scopes.length) params.set('scope', scopes.join(' '))
  return `${host}${FIREFLY_OAUTH_AUTHORIZE_PATH}?${params.toString()}`
}

export async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  instanceHost: string | undefined,
): Promise<Credentials> {
  const host = normaliseInstanceUrl(instanceHost)
  await assertInstancePublic(host)
  const tokenUrl = `${host}${FIREFLY_OAUTH_TOKEN_PATH}`

  const { data } = await axios.post<Record<string, unknown>>(
    tokenUrl,
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
    {
      headers: {
        Authorization: `Basic ${basicAuth(clientId, clientSecret)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
    },
  )
  const creds = parseTokenResponse(data)
  // Store the instance host so the client can build absolute URLs later.
  creds.tenantId = host
  creds.extra = { instanceUrl: host }
  return creds
}

export async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
  credentials: Pick<Credentials, 'tenantId' | 'extra'>,
): Promise<Credentials> {
  const host = normaliseInstanceUrl(storedInstanceUrl(credentials))
  await assertInstancePublic(host)
  const tokenUrl = `${host}${FIREFLY_OAUTH_TOKEN_PATH}`

  const { data } = await axios.post<Record<string, unknown>>(
    tokenUrl,
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
    {
      headers: {
        Authorization: `Basic ${basicAuth(clientId, clientSecret)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
    },
  )
  const creds = parseTokenResponse(data)
  if (!creds.refreshToken) creds.refreshToken = refreshToken
  // Preserve the instance host.
  creds.tenantId = host
  creds.extra = { ...(credentials.extra ?? {}), instanceUrl: host }
  return creds
}
