/**
 * Stripe Connect OAuth helpers.
 *
 * Stripe issues two flavours of credentials:
 *  - Connect (Standard / Express): authorization-code flow via the
 *    /oauth/authorize + /oauth/token endpoints — what we implement here.
 *  - Restricted / secret key (a fixed `sk_*` / `rk_*` token): the adapter
 *    declares `credentialFields` + `exchangeCredentials` (see `index.ts`) so
 *    `POST /auth/payments/stripe/connect` stores the key as the bearer token.
 *    Nothing in this file is involved in that path.
 *
 * Docs: https://docs.stripe.com/connect/oauth-reference
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { OAUTH_AUTHORIZE_URL, OAUTH_TOKEN_URL } from './constants'

export function buildAuthUrl(
  clientId: string,
  redirectUri: string,
  scopes: string[],
  state: string,
): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: scopes.join(' '),
    redirect_uri: redirectUri,
    state,
  })
  return `${OAUTH_AUTHORIZE_URL}?${params.toString()}`
}

interface StripeTokenResponse {
  access_token: string
  refresh_token?: string
  livemode: boolean
  token_type: 'bearer'
  scope: string
  stripe_publishable_key?: string
  stripe_user_id: string
}

export async function exchangeCode(
  code: string,
  clientSecret: string,
): Promise<Credentials> {
  const { data } = await axios.post<StripeTokenResponse>(
    OAUTH_TOKEN_URL,
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_secret: clientSecret,
    }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' } },
  )

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    scope: data.scope,
    extra: {
      stripeUserId: data.stripe_user_id,
      livemode: data.livemode,
    },
  }
}

export async function refreshCredentials(
  credentials: Credentials,
  clientSecret: string,
): Promise<Credentials> {
  if (!credentials.refreshToken) return credentials
  const { data } = await axios.post<StripeTokenResponse>(
    OAUTH_TOKEN_URL,
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: credentials.refreshToken,
      client_secret: clientSecret,
    }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' } },
  )
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? credentials.refreshToken,
    scope: data.scope,
    extra: {
      ...(credentials.extra ?? {}),
      stripeUserId: data.stripe_user_id,
      livemode: data.livemode,
    },
  }
}
