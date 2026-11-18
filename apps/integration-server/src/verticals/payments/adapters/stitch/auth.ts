/**
 * Stitch client-token auth.
 *
 * "Stitch uses the OAuth 2.0 Client Credentials Flow for client tokens. This
 * flow entails making a POST request to the https://secure.stitch.money/connect/token
 * endpoint. [...] The parameters are form encoded per OAuth 2.0 standards."
 * Body: client_id, scope, grant_type=client_credentials, audience, client_secret.
 * Response: { access_token, expires_in, token_type, scope }.
 * (https://docs.stitch.money/authentication/client-tokens)
 *
 * The connection holds the merchant's own Stitch client_id / client_secret on
 * `credentials.extra`, so a token can be re-minted when it expires.
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { CLIENT_SCOPES, OAUTH_TOKEN_URL, TOKEN_AUDIENCE } from './constants'

export interface StitchExtra {
  clientId: string
  clientSecret: string
}

interface StitchTokenResponse {
  access_token: string
  expires_in?: number
  token_type?: string
  scope?: string
}

export function readExtra(credentials: Credentials): StitchExtra {
  const extra = (credentials.extra ?? {}) as Partial<StitchExtra>
  const clientId = typeof extra.clientId === 'string' ? extra.clientId : ''
  const clientSecret = typeof extra.clientSecret === 'string' ? extra.clientSecret : ''
  if (!clientId || !clientSecret) {
    throw Object.assign(
      new Error(
        'Stitch connection has no client_id / client_secret; reconnect with the Stitch client credentials.',
      ),
      { statusCode: 401, code: 'REAUTH_REQUIRED' },
    )
  }
  return { clientId, clientSecret }
}

export async function mintClientToken(
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  const { data } = await axios.post<StitchTokenResponse>(
    OAUTH_TOKEN_URL,
    new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      scope: CLIENT_SCOPES.join(' '),
      audience: TOKEN_AUDIENCE,
      client_secret: clientSecret,
    }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  )
  if (!data?.access_token) throw new Error('Stitch token endpoint returned no access_token.')
  return {
    accessToken: data.access_token,
    scope: data.scope,
    expiresAt:
      typeof data.expires_in === 'number'
        ? new Date(Date.now() + data.expires_in * 1000)
        : undefined,
    extra: { clientId, clientSecret },
  }
}

/** Connect-form exchange: validate the two fields, then mint the first token. */
export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const clientId = (fields.clientId ?? '').trim()
  const clientSecret = (fields.clientSecret ?? '').trim()
  if (!clientId || !clientSecret)
    throw new Error('Stitch client ID and client secret are required.')
  return mintClientToken(clientId, clientSecret)
}

/** Client tokens have no refresh token; a new one is minted from the stored pair. */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const { clientId, clientSecret } = readExtra(credentials)
  return mintClientToken(clientId, clientSecret)
}
