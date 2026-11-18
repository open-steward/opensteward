/**
 * Acumatica OAuth2 (authorization_code) helpers.
 *
 * Every Acumatica site has its own identity server: the authorize, token and
 * REST endpoints all hang off the customer's instance URL — an
 * Acumatica-hosted `https://acme.acumatica.com` or a self-hosted server,
 * often in a virtual directory (`https://erp.example.com/AcumaticaERP`).
 * That URL is collected per connection (`oauthFields`) and kept in
 * `credentials.extra.instanceUrl`.
 *
 * The token endpoint receives the client secret, so the host is resolved and
 * refused if it points at a private/reserved address before any request.
 */
import axios from 'axios'
import { ACUMATICA_AUTH_PATH, ACUMATICA_TOKEN_PATH } from './constants'
import type { Credentials } from '../../adapter/interface'
import { assertPublicHost, basicAuth } from '@opensteward/shared'

/**
 * Reduce whatever a customer typed for their site to `https://host[/path]`:
 * trims, lowercases the host, assumes https when no scheme was typed, and
 * drops query, fragment and trailing slashes. The path is kept because
 * self-hosted sites live under a virtual directory.
 */
export function normaliseInstanceUrl(raw: string | undefined | null): string {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) {
    throw new Error('Acumatica instance URL is required (e.g. https://acme.acumatica.com).')
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    throw new Error('Acumatica instance URL is not a valid URL.')
  }
  if (url.protocol !== 'https:') throw new Error('Acumatica instance URL must use https.')
  if (url.username || url.password) {
    throw new Error('Acumatica instance URL must not contain a username or password.')
  }
  return `https://${url.host}${url.pathname.replace(/\/+$/, '')}`
}

/** Normalise, then refuse hosts that resolve to private/reserved addresses. */
async function vetInstanceUrl(raw: string | undefined | null): Promise<string> {
  const instanceUrl = normaliseInstanceUrl(raw)
  await assertPublicHost(new URL(instanceUrl).hostname.replace(/^\[|\]$/g, ''))
  return instanceUrl
}

export function buildAuthUrl(
  clientId: string,
  redirectUri: string,
  scopes: string[],
  state: string,
  instanceUrl: string | undefined,
): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopes.join(' '),
    state,
  })
  return `${normaliseInstanceUrl(instanceUrl)}${ACUMATICA_AUTH_PATH}?${params.toString()}`
}

function parseTokenResponse(
  data: Record<string, unknown>,
  instanceUrl: string,
): Credentials {
  return {
    accessToken: data['access_token'] as string,
    refreshToken: data['refresh_token'] as string | undefined,
    expiresAt: new Date(Date.now() + (data['expires_in'] as number) * 1000),
    scope: data['scope'] as string | undefined,
    extra: { instanceUrl },
  }
}

export async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  rawInstanceUrl: string | undefined,
): Promise<Credentials> {
  const instanceUrl = await vetInstanceUrl(rawInstanceUrl)
  const { data } = await axios.post<Record<string, unknown>>(
    `${instanceUrl}${ACUMATICA_TOKEN_PATH}`,
    new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
    {
      headers: {
        Authorization: `Basic ${basicAuth(clientId, clientSecret)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    },
  )
  return parseTokenResponse(data, instanceUrl)
}

export async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
  rawInstanceUrl: string | undefined,
): Promise<Credentials> {
  const instanceUrl = await vetInstanceUrl(rawInstanceUrl)
  const { data } = await axios.post<Record<string, unknown>>(
    `${instanceUrl}${ACUMATICA_TOKEN_PATH}`,
    new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
    {
      headers: {
        Authorization: `Basic ${basicAuth(clientId, clientSecret)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    },
  )
  const creds = parseTokenResponse(data, instanceUrl)
  if (!creds.refreshToken) creds.refreshToken = refreshToken
  return creds
}
