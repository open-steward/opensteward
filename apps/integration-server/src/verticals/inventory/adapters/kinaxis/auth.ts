/**
 * Kinaxis Maestro OAuth2 authentication helpers.
 *
 * Kinaxis Maestro uses the standard Authorization Code grant (OAuth 2.0).
 * Credentials are tenant-scoped — every customer's auth server lives at
 * {tenant}.kinaxis.com/oauth/. The tenant slug must be supplied as a
 * credential field so we can build the correct token URL at runtime.
 *
 * Token response conforms to RFC 6749 § 5.1.
 */
import axios from 'axios'
import type { Credentials, CredentialField } from '@opensteward/shared'
import { basicAuth, parseTokenResponse } from '@opensteward/shared'
import { authUrl, tokenUrl, DEFAULT_SCOPES } from './constants'

/**
 * Form fields shown on the hosted Connect page when using the manual /
 * client-credentials flow (e.g. server-to-server integrations).
 */
export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'tenant',
      label: 'Tenant Slug',
      type: 'text',
      placeholder: 'acme',
      helpText: 'The subdomain of your Kinaxis Maestro instance (e.g. "acme" for acme.kinaxis.com).',
      required: true,
    },
    {
      name: 'clientId',
      label: 'Client ID',
      type: 'text',
      required: true,
    },
    {
      name: 'clientSecret',
      label: 'Client Secret',
      type: 'password',
      required: true,
    },
  ]
}

/** Client-credentials grant — used when credentialFields() form is submitted. */
export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const { tenant, clientId, clientSecret } = fields
  if (!tenant) throw new Error('kinaxis: tenant slug is required')
  if (!clientId) throw new Error('kinaxis: clientId is required')
  if (!clientSecret) throw new Error('kinaxis: clientSecret is required')

  const { data } = await axios.post<Record<string, unknown>>(
    tokenUrl(tenant),
    new URLSearchParams({
      grant_type: 'client_credentials',
      scope: DEFAULT_SCOPES.join(' '),
    }),
    {
      headers: {
        Authorization: `Basic ${basicAuth(clientId, clientSecret)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    },
  )
  const creds = parseTokenResponse(data)
  return { ...creds, extra: { tenant, clientId, clientSecret } }
}

/** Build the OAuth2 authorization URL for the user-facing browser redirect. */
export function buildAuthUrl(
  tenant: string,
  clientId: string,
  redirectUri: string,
  state: string,
  scopes: string[] = DEFAULT_SCOPES,
): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopes.join(' '),
    state,
  })
  return `${authUrl(tenant)}?${params.toString()}`
}

/** Exchange an authorization code for tokens (authorization_code grant). */
export async function exchangeCode(
  code: string,
  tenant: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): Promise<Credentials> {
  const { data } = await axios.post<Record<string, unknown>>(
    tokenUrl(tenant),
    new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
    {
      headers: {
        Authorization: `Basic ${basicAuth(clientId, clientSecret)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    },
  )
  const creds = parseTokenResponse(data)
  return { ...creds, extra: { tenant, clientId, clientSecret } }
}

/** Refresh an expired access token. Falls back to client_credentials if no refresh_token. */
export async function refreshAccessToken(credentials: Credentials): Promise<Credentials> {
  const { extra } = credentials
  const tenant = String(extra?.['tenant'] ?? '')
  const clientId = String(extra?.['clientId'] ?? '')
  const clientSecret = String(extra?.['clientSecret'] ?? '')

  if (!tenant || !clientId || !clientSecret) {
    throw new Error('kinaxis: cannot refresh — tenant/clientId/clientSecret missing from extra')
  }

  const grantParams: Record<string, string> = credentials.refreshToken
    ? { grant_type: 'refresh_token', refresh_token: credentials.refreshToken }
    : { grant_type: 'client_credentials', scope: DEFAULT_SCOPES.join(' ') }

  const { data } = await axios.post<Record<string, unknown>>(
    tokenUrl(tenant),
    new URLSearchParams(grantParams),
    {
      headers: {
        Authorization: `Basic ${basicAuth(clientId, clientSecret)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    },
  )
  const creds = parseTokenResponse(data)
  // Preserve refresh token if not rotated
  if (!creds.refreshToken && credentials.refreshToken) {
    creds.refreshToken = credentials.refreshToken
  }
  return { ...creds, extra }
}
