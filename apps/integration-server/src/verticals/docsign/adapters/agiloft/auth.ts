/**
 * Agiloft OAuth2 helpers (Authorization-Code Grant).
 *
 * Agiloft's OAuth2 client is created in the KB at
 * Setup > Integration > OAuth2 Client Setup. The authorize/token endpoints
 * (`/ewws/oauth`, `/ewws/otoken`) are on the customer's own Agiloft server —
 * a `*.agiloft.com` cloud host or a self-hosted one — so the server and the
 * KB are collected per connection (`oauthFields`) and carried on
 * `credentials.extra` for the client and the refresh flow.
 *
 * The server is free-form and the token exchange POSTs the client secret to
 * it, so it must be https and must resolve to a public address before any
 * request is made.
 *
 * Docs: https://help.agiloft.com/space/HELP/43716464/Using+OAuth2+to+Access+REST+API
 */

import axios from 'axios'
import { assertPublicHost, type Credentials } from '@opensteward/shared'
import { OAUTH_AUTHORIZE_PATH, OAUTH_TOKEN_PATH } from './constants'

const HOST_REQUIRED = 'Agiloft server is required (e.g. acme.agiloft.com).'
const HOST_INVALID = 'Agiloft server is not a valid https URL or host name.'
const HOST_NOT_CONFIGURED = 'Agiloft server is not configured for this connection.'
const KB_REQUIRED = 'Agiloft knowledge base (KB) name is required.'
const KB_INVALID =
  'Agiloft knowledge base (KB) name may only contain letters, digits, ".", "_" and "-".'

/**
 * Reduce what a customer typed for their Agiloft server to `host[:port]`:
 * `acme.agiloft.com`, `https://ACME.agiloft.com/ui2/login` both become
 * `acme.agiloft.com`. Anything but https is refused.
 */
export function normaliseAgiloftHost(raw: string | undefined | null): string {
  const s = (raw ?? '').trim()
  if (!s) throw new Error(HOST_REQUIRED)
  const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(s)?.[1]?.toLowerCase()
  if (scheme && scheme !== 'https') throw new Error('Agiloft server must use https.')
  let url: URL
  try {
    url = new URL(scheme ? s : `https://${s}`)
  } catch {
    throw new Error(HOST_INVALID)
  }
  if (url.username || url.password || !url.hostname) throw new Error(HOST_INVALID)
  return url.host
}

/** KB names are case-sensitive REST path segments; keep case, refuse anything path-breaking. */
export function normaliseAgiloftKb(raw: string | undefined | null): string {
  const s = (raw ?? '').trim()
  if (!s) throw new Error(KB_REQUIRED)
  if (!/^[A-Za-z0-9._-]+$/.test(s) || /^\.+$/.test(s)) throw new Error(KB_INVALID)
  return s
}

/** The server a stored connection talks to, falling back to deployment config. */
export function connectionAgiloftHost(credentials: Credentials, fallback?: string): string {
  const stored = credentials.extra?.['host']
  const raw = typeof stored === 'string' && stored.trim() ? stored : fallback
  if (!raw || !raw.trim()) throw new Error(HOST_NOT_CONFIGURED)
  return normaliseAgiloftHost(raw)
}

async function assertPublicAgiloftHost(host: string): Promise<void> {
  await assertPublicHost(new URL(`https://${host}`).hostname)
}

function authorizeUrl(host: string): string {
  return `https://${host}${OAUTH_AUTHORIZE_PATH}`
}

function tokenUrl(host: string): string {
  return `https://${host}${OAUTH_TOKEN_PATH}`
}

export function buildAuthUrl(
  host: string | undefined,
  kb: string | undefined,
  clientId: string,
  redirectUri: string,
  scopes: string[],
  state: string,
): string {
  const normalisedHost = normaliseAgiloftHost(host)
  normaliseAgiloftKb(kb)
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopes.join(' '),
    state,
  })
  return `${authorizeUrl(normalisedHost)}?${params.toString()}`
}

interface TokenResponse {
  access_token: string
  refresh_token?: string
  token_type: string
  expires_in: number
  scope?: string
}

export async function exchangeCode(
  host: string | undefined,
  kb: string | undefined,
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  const normalisedHost = normaliseAgiloftHost(host)
  const normalisedKb = normaliseAgiloftKb(kb)
  await assertPublicAgiloftHost(normalisedHost)
  const { data } = await axios.post<TokenResponse>(
    tokenUrl(normalisedHost),
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    }).toString(),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    },
  )
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
    scope: data.scope,
    extra: { host: normalisedHost, kb: normalisedKb },
  }
}

export async function refreshCredentials(
  host: string | undefined,
  kb: string | undefined,
  credentials: Credentials,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  if (!credentials.refreshToken) return credentials
  const resolvedHost = connectionAgiloftHost(credentials, host)
  const resolvedKb = String(credentials.extra?.['kb'] ?? kb ?? '')
  await assertPublicAgiloftHost(resolvedHost)
  const { data } = await axios.post<TokenResponse>(
    tokenUrl(resolvedHost),
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: credentials.refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    },
  )
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? credentials.refreshToken,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
    scope: data.scope ?? credentials.scope,
    extra: { ...(credentials.extra ?? {}), host: resolvedHost, kb: resolvedKb },
  }
}
