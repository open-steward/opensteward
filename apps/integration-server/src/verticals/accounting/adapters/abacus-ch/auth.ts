/**
 * Abacus ERP OAuth2 helpers.
 *
 * Abacus uses a standard OAuth2 authorization_code flow (user-dependent
 * service users). The authorization and token endpoints live on the
 * customer's own Abacus server, so every URL is constructed from the server
 * URL the customer supplies at connect time (`oauthFields`).
 *
 * Credentials storage convention used by this adapter:
 *   credentials.extra.tenantBaseUrl — the normalised server origin, e.g. "https://mycompany.abacus.ch"
 *   credentials.tenantId            — the same value, kept for connections made before `extra` was used
 *
 * The token endpoint receives the client secret, so the host is resolved and
 * refused if it points at a private/reserved address before any request.
 */

import axios from 'axios'
import { ABACUS_AUTH_PATH, ABACUS_TOKEN_PATH, DEFAULT_TOKEN_TTL_SECONDS } from './constants'
import type { Credentials } from '../../adapter/interface'
import { assertPublicHost, basicAuth } from '@opensteward/shared'

/**
 * Reduce whatever a customer typed for their Abacus server to its https
 * origin: trims, lowercases the host, assumes https when no scheme was typed,
 * keeps a port, and drops any path, query or fragment (the OAuth and REST
 * paths are appended to the origin).
 */
export function normaliseTenantBaseUrl(raw: string | undefined | null): string {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) throw new Error('Abacus server URL is required (e.g. https://abacus.example.ch).')
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    throw new Error('Abacus server URL is not a valid URL.')
  }
  if (url.protocol !== 'https:') throw new Error('Abacus server URL must use https.')
  if (url.username || url.password) {
    throw new Error('Abacus server URL must not contain a username or password.')
  }
  return `https://${url.host}`
}

/** Normalise, then refuse hosts that resolve to private/reserved addresses. */
async function vetTenantBaseUrl(raw: string | undefined | null): Promise<string> {
  const tenantBaseUrl = normaliseTenantBaseUrl(raw)
  await assertPublicHost(new URL(tenantBaseUrl).hostname.replace(/^\[|\]$/g, ''))
  return tenantBaseUrl
}

/** Build the OAuth2 authorize URL for a given tenant instance. */
export function buildAuthUrl(
  tenantBaseUrl: string | undefined,
  clientId: string,
  redirectUri: string,
  scopes: string[],
  state: string,
): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopes.join(' '),
    state,
  })
  return `${normaliseTenantBaseUrl(tenantBaseUrl)}${ABACUS_AUTH_PATH}?${params.toString()}`
}

function parseTokenResponse(
  data: Record<string, unknown>,
  tenantBaseUrl: string,
): Credentials {
  const expiresIn =
    typeof data['expires_in'] === 'number' ? data['expires_in'] : DEFAULT_TOKEN_TTL_SECONDS
  return {
    accessToken: data['access_token'] as string,
    refreshToken: (data['refresh_token'] as string | undefined) ?? undefined,
    expiresAt: new Date(Date.now() + expiresIn * 1000),
    scope: (data['scope'] as string | undefined) ?? undefined,
    tenantId: tenantBaseUrl,
    extra: { tenantBaseUrl },
  }
}

/**
 * Exchange an authorization code for tokens.
 *
 * @param code              Authorization code received from the callback
 * @param clientId          Abacus Service-User client ID
 * @param clientSecret      Abacus Service-User client secret
 * @param redirectUri       The same redirect URI used when building the auth URL
 * @param rawTenantBaseUrl  Customer-supplied server URL (normalised and SSRF-checked here)
 */
export async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  rawTenantBaseUrl: string | undefined,
): Promise<Credentials> {
  const tenantBaseUrl = await vetTenantBaseUrl(rawTenantBaseUrl)
  const tokenUrl = `${tenantBaseUrl}${ABACUS_TOKEN_PATH}`
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
  return parseTokenResponse(data, tenantBaseUrl)
}

/**
 * Use a refresh token to obtain a new access token.
 */
export async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
  rawTenantBaseUrl: string | undefined,
): Promise<Credentials> {
  const tenantBaseUrl = await vetTenantBaseUrl(rawTenantBaseUrl)
  const tokenUrl = `${tenantBaseUrl}${ABACUS_TOKEN_PATH}`
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
  const creds = parseTokenResponse(data, tenantBaseUrl)
  // Abacus may not rotate the refresh token on every refresh
  if (!creds.refreshToken) creds.refreshToken = refreshToken
  return creds
}
