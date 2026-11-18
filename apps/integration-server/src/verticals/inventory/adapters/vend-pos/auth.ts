/**
 * Vend POS (Lightspeed Retail X-Series) OAuth 2.0 authorization-code flow.
 *
 * Authorization URL:  https://secure.retail.lightspeed.app/connect
 * Token endpoint:     https://{domain_prefix}.retail.lightspeed.app/api/1.0/token
 *
 * After a successful code exchange the `domain_prefix` is embedded in the
 * token-endpoint response (or derived from the retailer's store URL that
 * is supplied as `redirectUri` domain). We store it in credentials.extra
 * so the client can build the correct per-tenant base URL at call time.
 */
import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { OAUTH_AUTHORIZE_URL, OAUTH_TOKEN_URL_TEMPLATE, DEFAULT_SCOPES } from './constants'

function tokenUrl(domainPrefix: string): string {
  return OAUTH_TOKEN_URL_TEMPLATE.replace('{domainPrefix}', domainPrefix)
}

/**
 * Build the OAuth 2.0 authorization URL.
 *
 * @param state         CSRF state token (min 8 chars, required by Lightspeed).
 * @param clientId      OAuth application client_id.
 * @param redirectUri   Registered redirect URI.
 * @param scopes        Optional scope override; defaults to DEFAULT_SCOPES.
 */
export function getAuthUrl(
  state: string,
  clientId: string,
  redirectUri: string,
  scopes?: string[],
): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: (scopes ?? DEFAULT_SCOPES).join(' '),
    state,
  })
  return `${OAUTH_AUTHORIZE_URL}?${params.toString()}`
}

/**
 * Exchange an authorization code for access + refresh tokens.
 *
 * The `domainPrefix` must be supplied — it is the subdomain the retailer
 * uses to access their Lightspeed back-office (e.g. "mystore" from
 * "mystore.vendhq.com"). Callers derive this from the state or from a
 * pre-registration step.
 */
export async function exchangeCode(
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string,
  domainPrefix: string,
): Promise<Credentials> {
  const { data } = await axios.post<{
    access_token: string
    refresh_token?: string
    expires_in?: number
    token_type?: string
    domain_prefix?: string
  }>(
    tokenUrl(domainPrefix),
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    }).toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
    },
  )

  // Lightspeed may echo the domain_prefix in the token response; fall back to
  // the caller-supplied value.
  const resolvedPrefix = data.domain_prefix ?? domainPrefix

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    extra: {
      domainPrefix: resolvedPrefix,
      clientId,
      clientSecret,
      expiresIn: data.expires_in,
      tokenType: data.token_type ?? 'Bearer',
    },
  }
}

/**
 * Refresh an expired access token using the stored refresh token.
 */
export async function refreshAccessToken(credentials: Credentials): Promise<Credentials> {
  if (!credentials.refreshToken) return credentials

  const domainPrefix = String(credentials.extra?.['domainPrefix'] ?? '')
  const clientId = String(credentials.extra?.['clientId'] ?? '')
  const clientSecret = String(credentials.extra?.['clientSecret'] ?? '')

  if (!domainPrefix || !clientId || !clientSecret) return credentials

  const { data } = await axios.post<{
    access_token: string
    refresh_token?: string
    expires_in?: number
    token_type?: string
  }>(
    tokenUrl(domainPrefix),
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: credentials.refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
    },
  )

  return {
    ...credentials,
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? credentials.refreshToken,
    extra: {
      ...credentials.extra,
      expiresIn: data.expires_in,
      tokenType: data.token_type ?? 'Bearer',
    },
  }
}
