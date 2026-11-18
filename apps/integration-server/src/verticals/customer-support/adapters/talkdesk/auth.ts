/**
 * Talkdesk OAuth 2.0 Authorization Code flow.
 *
 * Access tokens expire after 10 minutes; refresh tokens are long-lived.
 *
 * Token endpoint:     https://{accountName}.talkdeskid.com/oauth/token
 * Authorize endpoint: https://{accountName}.talkdeskid.com/oauth/authorize
 *
 * Both the account name and the region are the customer's, so they are
 * collected on the Connect page (`oauthFields`) and stored in
 * credentials.extra.accountName / credentials.extra.region. The account host
 * receives the client secret: the name is validated so that it can only ever
 * become a Talkdesk host.
 */
import axios from 'axios'
import type { Credentials, CredentialField } from '@opensteward/shared'
import {
  buildTokenUrl,
  buildAuthorizeUrl,
  API_BASE_URL_BY_REGION,
  OAUTH_DOMAIN_BY_REGION,
  DEFAULT_SCOPES,
  DEFAULT_REGION,
} from './constants'

const REGION_LABELS: Record<string, string> = {
  us: 'United States',
  eu: 'Europe',
  ca: 'Canada',
  uk: 'United Kingdom',
}

/** Regions for which both the identity and the API host are known. */
const REGIONS = Object.keys(OAUTH_DOMAIN_BY_REGION).filter((r) => r in API_BASE_URL_BY_REGION)

/** Talkdesk domains an account address may be pasted from: identity and app hosts. */
const ACCOUNT_HOST_SUFFIXES = REGIONS.flatMap((r) => {
  const identity = OAUTH_DOMAIN_BY_REGION[r]!
  return [identity, identity.replace(/^talkdeskid/, 'mytalkdesk')]
})

const ACCOUNT_NAME = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/

/**
 * Reduce whatever the customer typed to the bare account name: `acme`,
 * `acme.mytalkdesk.com`, `https://acme.mytalkdesk.com/atlas` all become `acme`.
 * Rejects blanks and any host that is not a Talkdesk account host.
 */
export function normaliseAccountName(raw: string | undefined | null): string {
  const s = (raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/[/?#].*$/, '')
  if (!s) throw new Error('Talkdesk account name is required.')
  const invalid = new Error(
    'Talkdesk account name must be the name from your {name}.mytalkdesk.com address.',
  )
  let name = s
  if (s.includes('.')) {
    const suffix = ACCOUNT_HOST_SUFFIXES.find((d) => s.endsWith(`.${d}`))
    if (!suffix) throw invalid
    name = s.slice(0, -(suffix.length + 1))
  }
  if (!ACCOUNT_NAME.test(name)) throw invalid
  return name
}

/** `EU` → `eu`; blank → the default region; unknown → error. */
export function normaliseRegion(raw: string | undefined | null): string {
  const trimmed = (raw ?? '').trim()
  const value = trimmed.toLowerCase()
  if (!value) return DEFAULT_REGION
  if (!REGIONS.includes(value)) {
    throw new Error(`Talkdesk region "${trimmed}" is not a recognised region.`)
  }
  return value
}

export function oauthFields(): CredentialField[] {
  return [
    {
      name: 'accountName',
      label: 'Talkdesk account name',
      type: 'text',
      required: true,
      placeholder: 'acme',
      helpText: 'The name in your Talkdesk address — acme for acme.mytalkdesk.com.',
    },
    {
      name: 'region',
      label: 'Talkdesk region',
      type: 'select',
      required: true,
      options: REGIONS.map((value) => ({ value, label: REGION_LABELS[value] ?? value })),
      helpText: 'The region your Talkdesk account is hosted in.',
    },
  ]
}

export function buildAuthUrl(
  clientId: string,
  redirectUri: string,
  scopes: string[],
  state: string,
  accountName: string | undefined,
  region: string | undefined = DEFAULT_REGION,
): string {
  const authorizeUrl = buildAuthorizeUrl(normaliseAccountName(accountName), normaliseRegion(region))
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopes.join(' '),
    state,
  })
  return `${authorizeUrl}?${params.toString()}`
}

interface TokenResponse {
  access_token: string
  refresh_token?: string
  token_type: string
  expires_in?: number
  scope?: string
}

export async function exchangeCode(
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string,
  accountName: string | undefined,
  region: string | undefined = DEFAULT_REGION,
): Promise<Credentials> {
  const name = normaliseAccountName(accountName)
  const regionCode = normaliseRegion(region)
  const tokenUrl = buildTokenUrl(name, regionCode)
  const { data } = await axios.post<TokenResponse>(
    tokenUrl,
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    }).toString(),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    },
  )
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    scope: data.scope ?? DEFAULT_SCOPES.join(' '),
    expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined,
    extra: { region: regionCode, accountName: name },
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  if (!credentials.refreshToken) return credentials
  const region = normaliseRegion(credentials.extra?.['region'] as string | undefined)
  const accountName = normaliseAccountName(credentials.extra?.['accountName'] as string | undefined)
  const tokenUrl = buildTokenUrl(accountName, region)
  const { data } = await axios.post<TokenResponse>(
    tokenUrl,
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: credentials.refreshToken,
    }).toString(),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    },
  )
  return {
    ...credentials,
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? credentials.refreshToken,
    expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined,
  }
}
