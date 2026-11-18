/**
 * Webdox CLM authentication.
 *
 * Webdox CLM does not expose a browser-redirect OAuth flow. Customers
 * authenticate with an OAuth2 *password-credentials* grant: an account
 * email + password + `customer` (environment slug) are POSTed to the token
 * endpoint, returning a bearer token (valid ~120 min) plus a refresh token.
 *
 * The adapter collects these three fields through the Connect Link form
 * (auth_type=api_key) — see `index.ts` `credentialFields` / `exchangeCredentials`.
 * `customer` and the original `username` are stashed on `credentials.extra`
 * so the refresh grant can re-run without re-prompting.
 *
 * Docs: https://doc.webdoxclm.com/docs/v2/en/index.html (Authorization)
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { TOKEN_URL } from './constants'

interface WebdoxTokenResponse {
  access_token: string
  refresh_token?: string
  token_type: string
  expires_in: number
  created_at?: number
}

/** Exchange email + password + customer for a bearer token. */
export async function exchangeCredentials(
  username: string,
  password: string,
  customer?: string,
): Promise<Credentials> {
  const body: Record<string, string> = {
    grant_type: 'password',
    username,
    password,
  }
  if (customer) body.customer = customer

  const { data } = await axios.post<WebdoxTokenResponse>(
    TOKEN_URL,
    new URLSearchParams(body).toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
    },
  )

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
    extra: { username, ...(customer ? { customer } : {}) },
  }
}

/** Refresh an expired bearer token via the refresh_token grant. */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  if (!credentials.refreshToken) return credentials
  const customer = credentials.extra?.['customer']
  const body: Record<string, string> = {
    grant_type: 'refresh_token',
    refresh_token: credentials.refreshToken,
  }
  if (typeof customer === 'string' && customer) body.customer = customer

  const { data } = await axios.post<WebdoxTokenResponse>(
    TOKEN_URL,
    new URLSearchParams(body).toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
    },
  )

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? credentials.refreshToken,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
    extra: credentials.extra ?? {},
  }
}
