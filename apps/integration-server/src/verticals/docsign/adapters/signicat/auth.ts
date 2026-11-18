/**
 * Signicat OAuth 2.0 helpers — client-credentials grant only.
 *
 * Signicat is a server-to-server platform: there is no end-user redirect
 * flow. An API client (Client ID + Client Secret) mints a short-lived
 * (~600s) access token from the shared token endpoint with the
 * `signicat-api` scope. The adapter re-runs the grant on refresh; there is
 * no refresh token.
 *
 * Docs: https://developer.signicat.com/docs/connect-to-signicat-apis/quick-start-guide/
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { OAUTH_TOKEN_URL, DEFAULT_SCOPES } from './constants'

interface SignicatTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  scope?: string
}

async function requestToken(
  clientId: string,
  clientSecret: string,
  scopes: string[],
): Promise<Credentials> {
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const { data } = await axios.post<SignicatTokenResponse>(
    OAUTH_TOKEN_URL,
    new URLSearchParams({
      grant_type: 'client_credentials',
      scope: scopes.join(' '),
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
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
    scope: data.scope,
    // Persist the client credentials so refreshCredentials can re-run the
    // grant without re-prompting the operator.
    extra: { clientId, clientSecret },
  }
}

export async function exchangeCode(
  clientId: string,
  clientSecret: string,
  scopes: string[] = DEFAULT_SCOPES,
): Promise<Credentials> {
  return requestToken(clientId, clientSecret, scopes)
}

export async function refreshCredentials(
  credentials: Credentials,
  fallbackClientId: string,
  fallbackClientSecret: string,
  scopes: string[] = DEFAULT_SCOPES,
): Promise<Credentials> {
  const clientId = String(credentials.extra?.['clientId'] ?? fallbackClientId)
  const clientSecret = String(credentials.extra?.['clientSecret'] ?? fallbackClientSecret)
  return requestToken(clientId, clientSecret, scopes)
}
