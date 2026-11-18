/**
 * DocHub OAuth 2.0 — authorization code with PKCE.
 *
 * Endpoints and methods come from
 * https://dochub.com/.well-known/oauth-authorization-server:
 *   "authorization_endpoint":"https://dochub.com/oauth/authorize",
 *   "token_endpoint":"https://dochub.com/api/v2/oauth/token",
 *   "code_challenge_methods_supported":["S256"],
 *   "token_endpoint_auth_methods_supported":["none","client_secret_basic","client_secret_post"]
 *
 * The token request follows operationId createOAuthToken in
 * https://dev.dochub.com/api-reference/openapi.yaml: `security: - basicAuth: []`
 * ("`Authorization: Basic base64(client_id:client_secret)`"), a form body
 * `grant_type`, `code`, `redirect_uri`, `code_verifier` ("PKCE code verifier
 * (required if code_challenge was used)") or `grant_type`, `refresh_token`,
 * and the flat `application/json` response `flat_token_response`
 * (`access_token`, `token_type`, `expires_in`, `refresh_token`, `scope`).
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { OAUTH_AUTHORIZE_URL, OAUTH_TOKEN_URL } from './constants'

export function buildAuthUrl(
  clientId: string,
  redirectUri: string,
  scopes: string[],
  state: string,
  codeChallenge?: string,
): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    // Space-delimited, as the token response's `scope` is documented:
    // "Space-delimited list of granted scopes".
    scope: scopes.join(' '),
    redirect_uri: redirectUri,
    state,
  })
  if (codeChallenge) {
    params.set('code_challenge', codeChallenge)
    params.set('code_challenge_method', 'S256')
  }
  return `${OAUTH_AUTHORIZE_URL}?${params.toString()}`
}

/** `flat_token_response`: `access_token`, `token_type`, `expires_in` required. */
interface DochubTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  refresh_token?: string
  scope?: string
  created_at?: number
}

async function postToken(
  body: Record<string, string>,
  clientId: string,
  clientSecret: string,
): Promise<DochubTokenResponse> {
  const { data } = await axios.post<DochubTokenResponse>(
    OAUTH_TOKEN_URL,
    new URLSearchParams(body).toString(),
    {
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        // Selects `flat_token_response` over the JSON:API `token_response`.
        Accept: 'application/json',
      },
    },
  )
  if (!data?.access_token) throw new Error('DocHub token endpoint returned no access_token')
  return data
}

export async function exchangeCode(
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string,
  codeVerifier?: string,
): Promise<Credentials> {
  const data = await postToken(
    {
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
    },
    clientId,
    clientSecret,
  )
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
    scope: data.scope,
    extra: {},
  }
}

export async function refreshCredentials(
  credentials: Credentials,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  if (!credentials.refreshToken) return credentials
  const data = await postToken(
    { grant_type: 'refresh_token', refresh_token: credentials.refreshToken },
    clientId,
    clientSecret,
  )
  return {
    accessToken: data.access_token,
    // `refresh_token` is optional on the response; an absent one means the
    // stored token was not rotated.
    refreshToken: data.refresh_token ?? credentials.refreshToken,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
    // "Omit to keep existing scopes" — the request sends no `scope`.
    scope: data.scope ?? credentials.scope,
    extra: credentials.extra ?? {},
  }
}
