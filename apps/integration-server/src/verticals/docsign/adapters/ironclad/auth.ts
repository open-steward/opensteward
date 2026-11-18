/**
 * Ironclad OAuth 2.0 helpers (Authorization-Code Grant).
 *
 * Authorize + token endpoints are region-scoped and share the REST host
 * (`https://{region}.ironcladapp.com`). The region (na1, eu1, demo) is the
 * customer's, so it is collected per connection (`oauthFields`) and carried on
 * `credentials.extra`. The token exchange sends client credentials via HTTP
 * Basic auth; access tokens expire after 6 hours (expires_in = 21600) and a
 * non-expiring refresh token is returned (and reissued on each successful
 * refresh).
 *
 * Docs: https://developer.ironcladapp.com/reference/authorization-code-grant
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import {
  DEFAULT_REGION,
  OAUTH_AUTHORIZE_PATH,
  OAUTH_TOKEN_PATH,
  regionHost,
} from './constants'

const ROOT_DOMAIN = 'ironcladapp.com'
const REGION_REQUIRED = 'Ironclad region is required (na1, eu1 or demo).'
const REGION_FOREIGN = 'Ironclad region must be an ironcladapp.com subdomain such as na1, eu1 or demo.'

/**
 * Reduce what a customer typed for their region to the bare subdomain:
 * `eu1`, `eu1.ironcladapp.com`, `https://eu1.ironcladapp.com/...` all become
 * `eu1`; the bare production host `ironcladapp.com` is `na1`. Anything that
 * would put the host outside ironcladapp.com is refused — the token exchange
 * carries the client secret.
 */
export function normaliseIroncladRegion(raw: unknown): string {
  const s = (typeof raw === 'string' ? raw : '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/[/?#].*$/, '')
  if (!s) throw new Error(REGION_REQUIRED)
  if (s === ROOT_DOMAIN) return DEFAULT_REGION
  const label = s.endsWith(`.${ROOT_DOMAIN}`) ? s.slice(0, -(ROOT_DOMAIN.length + 1)) : s
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)) throw new Error(REGION_FOREIGN)
  return label
}

/** The region a stored connection uses. Connections created before regions were stored are na1. */
export function connectionIroncladRegion(credentials: Credentials): string {
  const stored = credentials.extra?.['region']
  return stored === undefined || stored === null ? DEFAULT_REGION : normaliseIroncladRegion(stored)
}

export function buildAuthUrl(
  clientId: string,
  redirectUri: string,
  scopes: string[],
  state: string,
  region: string | undefined,
): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopes.join(' '),
    state,
  })
  return `${regionHost(normaliseIroncladRegion(region))}${OAUTH_AUTHORIZE_PATH}?${params.toString()}`
}

interface IroncladTokenResponse {
  access_token: string
  refresh_token?: string
  token_type: string
  expires_in: number
  scope?: string
}

export async function exchangeCode(
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string,
  region: string | undefined,
): Promise<Credentials> {
  const normalisedRegion = normaliseIroncladRegion(region)
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const { data } = await axios.post<IroncladTokenResponse>(
    `${regionHost(normalisedRegion)}${OAUTH_TOKEN_PATH}`,
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }).toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basic}`,
        Accept: 'application/json',
      },
    },
  )
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
    scope: data.scope,
    extra: { region: normalisedRegion },
  }
}

export async function refreshCredentials(
  credentials: Credentials,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  if (!credentials.refreshToken) return credentials
  const region = connectionIroncladRegion(credentials)
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const { data } = await axios.post<IroncladTokenResponse>(
    `${regionHost(region)}${OAUTH_TOKEN_PATH}`,
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: credentials.refreshToken,
    }).toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basic}`,
        Accept: 'application/json',
      },
    },
  )
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? credentials.refreshToken,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
    scope: data.scope ?? credentials.scope,
    extra: { ...(credentials.extra ?? {}), region },
  }
}
