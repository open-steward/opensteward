/**
 * Spendesk OAuth2 authentication helpers.
 *
 * Two auth flows are supported:
 *
 * 1. Server-to-server (client_credentials):
 *    - POST /v1/auth/token with Basic base64(client_id:client_secret)
 *    - Returns { access_token, token_type }.  No refresh token — re-authenticate when expired.
 *    - Use `fetchClientCredentialsToken` for background integrations.
 *
 * 2. User-facing PKCE (authorization_code):
 *    - GET  /v1/oauth2/authorize        → redirect with code_challenge
 *    - POST /v1/oauth2/token/create     → exchange code + code_verifier
 *    - POST /v1/oauth2/token/refresh    → refresh access token
 *    - Use `buildAuthUrl` / `exchangeCode` / `refreshAccessToken` for OAuth apps.
 *
 * Docs: https://developer.spendesk.com/reference/v1-request-authorization
 */

import axios from 'axios'
import crypto from 'crypto'
import {
  SPENDESK_AUTH_URL,
  SPENDESK_PKCE_TOKEN_URL,
  SPENDESK_PKCE_REFRESH_URL,
  SPENDESK_TOKEN_URL,
} from './constants'
import type { Credentials } from '../../adapter/interface'
import { basicAuth } from '@opensteward/shared'

// ── PKCE helpers ─────────────────────────────────────────────────────────────

/** Generate a cryptographically random PKCE code verifier (43–128 chars, URL-safe). */
export function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url')
}

/**
 * Derive the PKCE code challenge from a code verifier.
 * Returns base64url(SHA-256(codeVerifier)) per RFC 7636 §4.2.
 */
export function deriveCodeChallenge(codeVerifier: string): string {
  return crypto.createHash('sha256').update(codeVerifier).digest('base64url')
}

/**
 * Build the OAuth2 PKCE authorization URL for user-facing flows.
 * Generates the code verifier + challenge internally and returns both
 * so the caller can store the verifier for the subsequent token exchange.
 */
export function buildAuthUrl(
  clientId: string,
  redirectUri: string,
  scopes: string[],
  state: string,
): { url: string; codeVerifier: string } {
  const codeVerifier = generateCodeVerifier()
  const codeChallenge = deriveCodeChallenge(codeVerifier)
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopes.join(' '),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  })
  return { url: `${SPENDESK_AUTH_URL}?${params.toString()}`, codeVerifier }
}

function parsePkceTokenResponse(data: Record<string, unknown>): Credentials {
  const expiresIn = data['expires_in'] as number | undefined
  return {
    accessToken: data['access_token'] as string,
    refreshToken: data['refresh_token'] as string | undefined,
    expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined,
    scope: data['scope'] as string | undefined,
  }
}

/** Exchange an authorization code for tokens (PKCE flow). */
export async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  codeVerifier: string,
): Promise<Credentials> {
  // RFC 6749 §4.1.3 requires application/x-www-form-urlencoded for token requests.
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    code,
    code_verifier: codeVerifier,
  })
  const { data } = await axios.post<Record<string, unknown>>(
    SPENDESK_PKCE_TOKEN_URL,
    body,
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
    },
  )
  return parsePkceTokenResponse(data)
}

/** Refresh an access token obtained via the PKCE flow. */
export async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  // RFC 6749 §6 requires application/x-www-form-urlencoded for refresh requests.
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  })
  const { data } = await axios.post<Record<string, unknown>>(
    SPENDESK_PKCE_REFRESH_URL,
    body,
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
    },
  )
  const creds = parsePkceTokenResponse(data)
  if (!creds.refreshToken) creds.refreshToken = refreshToken
  return creds
}

// ── Server-to-server (client_credentials) ────────────────────────────────────

/**
 * Obtain a short-lived bearer token using client credentials.
 * Spendesk does not issue a refresh token for this grant — callers must
 * re-invoke this function when the token expires.
 */
export async function fetchClientCredentialsToken(
  clientId: string,
  clientSecret: string,
  scope?: string,
): Promise<Credentials> {
  const body = new URLSearchParams({ grant_type: 'client_credentials' })
  if (scope) body.set('scope', scope)

  const { data } = await axios.post<Record<string, unknown>>(SPENDESK_TOKEN_URL, body, {
    headers: {
      Authorization: `Basic ${basicAuth(clientId, clientSecret)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
  })

  return {
    accessToken: data['access_token'] as string,
    // client_credentials grants have no refresh token; token_type is always "Bearer"
    refreshToken: undefined,
    expiresAt: undefined,
    scope: scope,
  }
}
