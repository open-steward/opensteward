/**
 * OTTO Market OAuth2 client-credentials helpers.
 *
 * No authorization-code / user-consent step exists — a seller mints a
 * client id + secret in OTTO Partner Connect and this adapter exchanges
 * them directly for a bearer token via `grant_type=client_credentials`.
 * Tokens expire after 1800s with no refresh token, so "refreshing" means
 * re-running the same grant.
 *
 * Docs: https://api.otto.market/docs/sellers-integration
 *       https://api.otto.market/docs/category/about-the-api
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { PRODUCTION_BASE_URL, SANDBOX_BASE_URL, TOKEN_PATH, DEFAULT_SCOPES } from './constants'

export type OttoEnvironment = 'production' | 'sandbox'

export function baseUrlFor(environment: string | undefined): string {
  return environment === 'sandbox' ? SANDBOX_BASE_URL : PRODUCTION_BASE_URL
}

export function tokenUrlFor(environment: string | undefined): string {
  return `${baseUrlFor(environment)}${TOKEN_PATH}`
}

interface OttoTokenResponse {
  access_token: string
  expires_in?: number
  token_type?: string
  scope?: string
}

/** Mint a fresh bearer token via the client-credentials grant. */
export async function mintToken(
  clientId: string,
  clientSecret: string,
  environment: string | undefined,
  scopes: string[] = DEFAULT_SCOPES,
): Promise<Credentials> {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  })
  if (scopes.length > 0) body.set('scope', scopes.join(' '))

  const { data } = await axios.post<OttoTokenResponse>(tokenUrlFor(environment), body.toString(), {
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
    },
    timeout: 30_000,
  })
  if (!data.access_token) {
    throw new Error('OTTO Market token endpoint returned an empty access_token')
  }
  const expiresAt =
    typeof data.expires_in === 'number' ? new Date(Date.now() + data.expires_in * 1000) : undefined
  return {
    accessToken: data.access_token,
    expiresAt,
    scope: data.scope,
    extra: { clientId, clientSecret, environment: environment ?? 'production' },
  }
}

/** Re-run the client-credentials grant using the client id/secret stashed in `extra`. */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const clientId = credentials.extra?.['clientId'] as string | undefined
  const clientSecret = credentials.extra?.['clientSecret'] as string | undefined
  const environment = credentials.extra?.['environment'] as string | undefined
  if (!clientId || !clientSecret) {
    throw new Error(
      'OTTO Market refreshCredentials requires clientId and clientSecret in ' +
        'credentials.extra — one or more were missing. Re-create the connection.',
    )
  }
  return mintToken(clientId, clientSecret, environment)
}
