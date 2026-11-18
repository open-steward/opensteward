/**
 * Adobe Workfront OAuth2 (authorization-code) auth.
 *
 * Both the authorize and token endpoints live on the customer's own
 * Workfront domain (e.g. `https://myorg.my.workfront.com`, or
 * `https://myorg.my.workfront.adobe.com` after Unified Shell onboarding), so
 * the domain is collected per connection (`oauthFields`), validated to stay on
 * a Workfront domain, and carried on `credentials.extra.instanceUrl`. The
 * token response carries `token_type: "sessionID"` — the resulting
 * `access_token` is presented to the REST API via the `sessionID` header (see
 * client.ts), not `Authorization: Bearer`.
 *
 * Note: the authorization `code` is only valid for ~2 minutes.
 *
 * Docs: https://experienceleague.adobe.com/en/docs/workfront/using/adobe-workfront-api/api-notes/oauth-app-code-token-flow
 *       https://experienceleague.adobe.com/en/docs/workfront/using/adobe-workfront-api/tips-troubleshooting-apis/locate-domain-for-api
 */
import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { OAUTH_AUTHORIZE_PATH, OAUTH_TOKEN_PATH } from './constants'

const WORKFRONT_SUFFIXES = ['.workfront.com', '.workfront.adobe.com']
const DOMAIN_REQUIRED = 'Workfront domain is required (e.g. myorg.my.workfront.com).'
const DOMAIN_FOREIGN = 'Workfront domain must be a *.workfront.com or *.workfront.adobe.com host.'
const DOMAIN_NOT_CONFIGURED = 'Workfront domain is not configured for this connection.'

/**
 * Reduce what a customer typed for their Workfront domain to an https origin:
 * `myorg` becomes `https://myorg.my.workfront.com`; a full host or pasted URL
 * keeps its host. Hosts outside Workfront's domains are refused — the token
 * exchange carries the client secret.
 */
export function normaliseWorkfrontDomain(raw: unknown): string {
  const s = (typeof raw === 'string' ? raw : '').trim().toLowerCase()
  if (!s) throw new Error(DOMAIN_REQUIRED)
  const scheme = /^([a-z][a-z0-9+.-]*):\/\//.exec(s)?.[1]
  if (scheme && scheme !== 'https') throw new Error('Workfront domain must use https.')
  const host = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').replace(/[/?#].*$/, '')
  if (!host) throw new Error(DOMAIN_REQUIRED)
  const full = host.includes('.') ? host : `${host}.my.workfront.com`
  const labelsOk = full
    .split('.')
    .every((label) => /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))
  const suffixOk = WORKFRONT_SUFFIXES.some(
    (suffix) => full.endsWith(suffix) && full.length > suffix.length,
  )
  if (!labelsOk || !suffixOk) throw new Error(DOMAIN_FOREIGN)
  return `https://${full}`
}

/** The domain a stored connection talks to, falling back to deployment config. */
export function connectionWorkfrontDomain(credentials: Credentials, fallback?: string): string {
  const stored = credentials.extra?.['instanceUrl']
  const raw = typeof stored === 'string' && stored.trim() ? stored : fallback
  if (!raw || !raw.trim()) throw new Error(DOMAIN_NOT_CONFIGURED)
  return normaliseWorkfrontDomain(raw)
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
  return `${normaliseWorkfrontDomain(instanceUrl)}${OAUTH_AUTHORIZE_PATH}?${params.toString()}`
}

interface TokenResponse {
  token_type: string
  access_token: string
  refresh_token?: string
  expires_in: number
  scope?: string
  wid?: string
}

function parseTokenResponse(data: TokenResponse, instanceUrl: string): Credentials {
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
    scope: data.scope,
    extra: { instanceUrl, ...(data.wid ? { wid: data.wid } : {}) },
  }
}

export async function exchangeCode(
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string,
  instanceUrl: string | undefined,
): Promise<Credentials> {
  const origin = normaliseWorkfrontDomain(instanceUrl)
  const { data } = await axios.post<TokenResponse>(
    `${origin}${OAUTH_TOKEN_PATH}`,
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  )
  return parseTokenResponse(data, origin)
}

export async function refreshCredentials(
  credentials: Credentials,
  clientId: string,
  clientSecret: string,
  fallbackInstanceUrl?: string,
): Promise<Credentials> {
  if (!credentials.refreshToken) return credentials
  const origin = connectionWorkfrontDomain(credentials, fallbackInstanceUrl)
  const { data } = await axios.post<TokenResponse>(
    `${origin}${OAUTH_TOKEN_PATH}`,
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: credentials.refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  )
  const refreshed = parseTokenResponse(data, origin)
  if (!refreshed.refreshToken) refreshed.refreshToken = credentials.refreshToken
  refreshed.extra = { ...credentials.extra, ...refreshed.extra }
  return refreshed
}
