/**
 * OAuth2 authorization_code + refresh_token flow for NetSuite SuiteProjects Pro.
 *
 * The authorize and token endpoints are company-ID-specific:
 *   https://<company-id>.app.netsuitesuiteprojectspro.com/login/oauth2/v1/token
 *
 * The company ID is the customer's, so it is collected per connection
 * (`oauthFields`), validated to stay on that domain, and carried on
 * `credentials.extra.companyId`.
 *
 * Client credentials MUST be sent as HTTP Basic Auth (Base64 clientId:clientSecret),
 * NOT in the request body (unlike most standard OAuth2 flows).
 *
 * Docs: https://docs.oracle.com/en/cloud/saas/netsuite-suiteprojects-pro/online-help/article_158624650963.html
 */
import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import {
  OAUTH_AUTHORIZE_URL_TEMPLATE,
  OAUTH_TOKEN_URL_TEMPLATE,
  DEFAULT_SCOPES,
} from './constants'

const ACCOUNT_SUFFIX = '.app.netsuitesuiteprojectspro.com'
const COMPANY_REQUIRED = 'SuiteProjects Pro company ID is required.'
const COMPANY_FOREIGN = 'SuiteProjects Pro account must be a *.app.netsuitesuiteprojectspro.com host.'
const COMPANY_INVALID = 'SuiteProjects Pro company ID may only contain letters, digits and "-".'
const COMPANY_NOT_CONFIGURED = 'SuiteProjects Pro company ID is not configured for this connection.'

/**
 * Reduce what a customer typed to the bare company ID: `acme`,
 * `acme.app.netsuitesuiteprojectspro.com` and a pasted account URL all become
 * `acme`. Hosts outside the account domain are refused — the token exchange
 * carries the client secret.
 */
export function normaliseCompanyId(raw: unknown): string {
  const s = (typeof raw === 'string' ? raw : '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/[/?#].*$/, '')
  if (!s) throw new Error(COMPANY_REQUIRED)
  let id = s
  if (s.includes('.')) {
    if (!s.endsWith(ACCOUNT_SUFFIX)) throw new Error(COMPANY_FOREIGN)
    id = s.slice(0, -ACCOUNT_SUFFIX.length)
    if (!id || id.includes('.')) throw new Error(COMPANY_FOREIGN)
  }
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(id)) throw new Error(COMPANY_INVALID)
  return id
}

/** The company ID a stored connection uses, falling back to deployment config. */
export function connectionCompanyId(credentials: Credentials, fallback?: string): string {
  const stored = credentials.extra?.['companyId']
  const raw = typeof stored === 'string' && stored.trim() ? stored : fallback
  if (!raw || !raw.trim()) throw new Error(COMPANY_NOT_CONFIGURED)
  return normaliseCompanyId(raw)
}

/** Substitute a (validated) company ID into an account-specific URL template. */
export function resolveTemplate(template: string, companyId: string): string {
  return template.replace('{companyId}', encodeURIComponent(normaliseCompanyId(companyId)))
}

function basicAuth(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
}

/**
 * Build the OAuth2 authorize URL for the given company account.
 *
 * @param companyId - The SuiteProjects Pro company identifier (subdomain).
 */
export function buildAuthUrl(
  companyId: string | undefined,
  clientId: string,
  redirectUri: string,
  scopes: string[],
  state: string,
): string {
  const authorizeUrl = resolveTemplate(OAUTH_AUTHORIZE_URL_TEMPLATE, normaliseCompanyId(companyId))
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    // OpenAir scopes are plus-delimited: rest+xml
    scope: scopes.join('+'),
    state,
  })
  return `${authorizeUrl}?${params.toString()}`
}

interface TokenResponse {
  access_token: string
  refresh_token?: string
  token_type: string
  /** Lifetime in seconds — default 900 (15 min). */
  expires_in: number
  scope?: string
}

export async function exchangeCode(
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string,
  companyId: string | undefined,
): Promise<Credentials> {
  const id = normaliseCompanyId(companyId)
  const tokenUrl = resolveTemplate(OAUTH_TOKEN_URL_TEMPLATE, id)
  const { data } = await axios.post<TokenResponse>(
    tokenUrl,
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }).toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: basicAuth(clientId, clientSecret),
      },
    },
  )
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
    scope: data.scope ?? DEFAULT_SCOPES.join('+'),
    extra: { companyId: id },
  }
}

export async function refreshCredentials(
  credentials: Credentials,
  clientId: string,
  clientSecret: string,
  fallbackCompanyId?: string,
): Promise<Credentials> {
  if (!credentials.refreshToken) return credentials
  const companyId = connectionCompanyId(credentials, fallbackCompanyId)
  const tokenUrl = resolveTemplate(OAUTH_TOKEN_URL_TEMPLATE, companyId)
  const { data } = await axios.post<TokenResponse>(
    tokenUrl,
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: credentials.refreshToken,
    }).toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: basicAuth(clientId, clientSecret),
      },
    },
  )
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? credentials.refreshToken,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
    scope: data.scope ?? credentials.scope,
    extra: { ...(credentials.extra ?? {}), companyId },
  }
}
