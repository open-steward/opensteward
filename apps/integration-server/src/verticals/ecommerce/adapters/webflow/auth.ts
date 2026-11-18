/**
 * Webflow OAuth2 helpers.
 *
 * Webflow uses a standard OAuth2 authorization code flow.
 *  - Authorize URL: https://webflow.com/oauth/authorize
 *  - Token URL:     https://api.webflow.com/oauth/access_token
 *
 * Webflow access tokens do NOT expire (no refresh_token is issued), so
 * `refreshCredentials` on the adapter is a no-op.
 *
 * Docs: https://developers.webflow.com/data/reference/authorization/authorize
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'

export function buildAuthUrl(
  clientId: string,
  redirectUri: string,
  scopes: string[],
  state: string,
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: scopes.join(' '),
    state,
  })
  return `https://webflow.com/oauth/authorize?${params.toString()}`
}

interface WebflowTokenResponse {
  access_token: string
  token_type?: string
}

export async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): Promise<Credentials> {
  const { data } = await axios.post<WebflowTokenResponse>(
    'https://api.webflow.com/oauth/access_token',
    {
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    },
    {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    },
  )

  // No expiresAt — Webflow access tokens do not expire.
  return {
    accessToken: data.access_token,
  }
}
