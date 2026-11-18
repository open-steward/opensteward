/**
 * Shopgate OAuth2 helpers.
 *
 * Shopgate uses the OAuth2 client-credentials + resource-owner password grant
 * (a custom "ShopgateCredentials" grant). The token endpoint is:
 *   https://auth.shopgate{env}.io/oauth/token
 *
 * Required credentials:
 *   - clientId       : application client id
 *   - clientSecret   : application client secret
 *   - merchantCode   : merchant identifier (e.g. "TM2")
 *   - username       : API-Credentials user email in Shopgate Admin
 *   - password       : API-Credentials user password
 *
 * Tokens are short-lived (~1 hour). The adapter stores `expiresAt` so the
 * shared `isTokenExpired` helper can trigger refresh automatically.
 *
 * Docs: https://docs.shopgate.com/docs/retail-red/edfdd9db319ed-authentication
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { SERVICES, ENVS } from './constants'

interface ShopgateTokenResponse {
  access_token: string
  token_type: string
  expires_in?: number
  scope?: string
}

function tokenUrl(envSuffix: string): string {
  return `https://${SERVICES.auth}.shopgate${envSuffix}.io/oauth/token`
}

/**
 * Fetch an OAuth2 bearer token using Shopgate's custom grant type.
 *
 * @param clientId      OAuth2 application client id
 * @param clientSecret  OAuth2 application client secret
 * @param merchantCode  Shopgate merchant code (e.g. "TM2")
 * @param username      API-Credentials user e-mail
 * @param password      API-Credentials user password
 * @param envSuffix     environment suffix ("", "pg", "dev")
 */
export async function fetchToken(
  clientId: string,
  clientSecret: string,
  merchantCode: string,
  username: string,
  password: string,
  envSuffix: string = ENVS.production,
): Promise<Credentials> {
  const { data } = await axios.post<ShopgateTokenResponse>(
    tokenUrl(envSuffix),
    new URLSearchParams({
      grant_type: 'ShopgateCredentials',
      client_id: clientId,
      client_secret: clientSecret,
      merchant_code: merchantCode,
      username,
      password,
    }),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
    },
  )

  const expiresAt = data.expires_in
    ? new Date(Date.now() + data.expires_in * 1000)
    : undefined

  return {
    accessToken: data.access_token,
    expiresAt,
    scope: data.scope,
    extra: { merchantCode, envSuffix, clientId, clientSecret, username, password },
  }
}

/**
 * Refresh an expired Shopgate access token by re-issuing the password grant.
 * All credential material is persisted in `credentials.extra`.
 */
export async function refreshToken(credentials: Credentials): Promise<Credentials> {
  const extra = credentials.extra as Record<string, string> | undefined
  if (!extra) throw new Error('Shopgate refreshToken: credentials.extra is missing')

  const { clientId, clientSecret, merchantCode, username, password, envSuffix } = extra
  if (!clientId || !clientSecret || !merchantCode || !username || !password) {
    throw new Error(
      'Shopgate refreshToken: clientId/clientSecret/merchantCode/username/password required in credentials.extra',
    )
  }
  return fetchToken(clientId, clientSecret, merchantCode, username, password, envSuffix ?? ENVS.production)
}
