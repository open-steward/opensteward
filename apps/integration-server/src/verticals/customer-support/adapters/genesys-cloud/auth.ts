/**
 * Genesys Cloud CX OAuth 2.0 authorization-code flow.
 *
 * Genesys Cloud uses standard OAuth 2.0 authorization code grant with
 * per-region login hosts (login.mypurecloud.com, login.mypurecloud.ie,
 * etc.).  Access tokens expire in 86400 seconds; a refresh token is provided
 * and can be used with grant_type=refresh_token.
 *
 * The region is the customer's organisation's, so it is collected on the
 * Connect page (`oauthFields`) as a closed set — the login host receives the
 * client secret, so a free-form value is never turned into a host.
 *
 * Docs: https://developer.genesys.cloud/authorization/platform-auth/use-authorization-code
 */
import axios from 'axios'
import type { Credentials, CredentialField } from '@opensteward/shared'
import {
  OAUTH_AUTHORIZE_URL_TEMPLATE,
  OAUTH_TOKEN_URL_TEMPLATE,
  REGION_MAP,
  DEFAULT_REGION,
  DEFAULT_SCOPES,
} from './constants'

/**
 * Reduce a region to its code (`eu-west-1`). Accepts the code in any case, or
 * the host suffix (`mypurecloud.ie`) that connections stored before region
 * codes were recorded. Anything else is refused rather than used as a host.
 */
export function normaliseRegion(raw: string | undefined | null): string {
  const trimmed = (raw ?? '').trim()
  const value = trimmed.toLowerCase()
  if (!value) throw new Error('Genesys Cloud region is required.')
  if (Object.hasOwn(REGION_MAP, value)) return value
  const byHost = Object.entries(REGION_MAP).find(([, host]) => host === value)
  if (byHost) return byHost[0]
  throw new Error(`Genesys Cloud region "${trimmed}" is not a recognised region.`)
}

/** Host suffix for a region, e.g. `eu-west-1` → `mypurecloud.ie`. */
export function regionHost(region: string | undefined | null): string {
  return REGION_MAP[normaliseRegion(region)]!
}

/** Region of a stored connection; connections from before regions were recorded are US East. */
export function storedRegion(credentials: Credentials): string {
  const stored = credentials.extra?.['region']
  return typeof stored === 'string' && stored.trim() ? stored : DEFAULT_REGION
}

function buildUrl(template: string, region: string | undefined): string {
  return template.replace('{region}', regionHost(region))
}

export function oauthFields(): CredentialField[] {
  return [
    {
      name: 'region',
      label: 'Genesys Cloud region',
      type: 'select',
      required: true,
      options: Object.entries(REGION_MAP).map(([value, host]) => ({
        value,
        label: `${value} (${host})`,
      })),
      helpText:
        'The region your organization is in — the domain you sign in on. ' +
        'For example, login.mypurecloud.ie is eu-west-1.',
    },
  ]
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
  return `${buildUrl(OAUTH_AUTHORIZE_URL_TEMPLATE, region)}?${params.toString()}`
}

interface TokenResponse {
  access_token: string
  token_type: string
  expires_in?: number
  refresh_token?: string
  scope?: string
}

export async function exchangeCode(
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string,
  region: string | undefined,
): Promise<Credentials> {
  const regionCode = normaliseRegion(region)
  const tokenUrl = buildUrl(OAUTH_TOKEN_URL_TEMPLATE, regionCode)
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const { data } = await axios.post<TokenResponse>(
    tokenUrl,
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }).toString(),
    {
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    },
  )
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    scope: data.scope,
    expiresAt: data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000)
      : undefined,
    extra: { region: regionCode },
  }
}

export async function refreshCredentials(
  credentials: Credentials,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  if (!credentials.refreshToken) return credentials
  const tokenUrl = buildUrl(OAUTH_TOKEN_URL_TEMPLATE, storedRegion(credentials))
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const { data } = await axios.post<TokenResponse>(
    tokenUrl,
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: credentials.refreshToken,
    }).toString(),
    {
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    },
  )
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? credentials.refreshToken,
    scope: data.scope ?? credentials.scope,
    expiresAt: data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000)
      : undefined,
    extra: credentials.extra,
  }
}

export { DEFAULT_SCOPES }
