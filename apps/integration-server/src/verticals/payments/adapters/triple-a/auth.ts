/**
 * Triple-A auth — OAuth 2 client-credentials grant only.
 *
 * https://developers.triple-a.io/docs/triplea-api-doc/fe7ac909c6ad8-authentication:
 * "Triple-A APIs are secured with OAuth 2.0 authentication using the Client
 * Credentials grant."
 *
 * The spec (Crypto-Payments.yaml) documents `POST /oauth/token` with an
 * `application/x-www-form-urlencoded` body `GettingAccessTokenReq`
 * (`client_id`, `client_secret`, `grant_type` — "Example :
 * `client_credentials`"; all three required) and a 200 body
 * `GettingAccessTokenResp` of `access_token`, `token_type` and `expires_in`
 * ("how long, in seconds, the access token will last"). No refresh token is
 * documented, so the client id / secret are kept on `credentials.extra` and a
 * refresh mints a new token.
 */

import axios from 'axios'
import type { CredentialField, Credentials } from '@opensteward/shared'
import { OAUTH_TOKEN_URL } from './constants'

export const TRIPLE_A_CREDENTIAL_FIELDS: CredentialField[] = [
  {
    name: 'clientId',
    label: 'Client ID',
    type: 'text',
    required: true,
    helpText: 'The client_id merchant credential you receive when you sign up with Triple-A.',
  },
  {
    name: 'clientSecret',
    label: 'Client secret',
    type: 'password',
    required: true,
    helpText: 'The client_secret merchant credential you receive when you sign up with Triple-A.',
  },
]

/** Documented 200 body of POST /oauth/token (GettingAccessTokenResp). */
interface TripleATokenResponse {
  access_token: string
  token_type?: string
  expires_in?: number
}

async function mintToken(clientId: string, clientSecret: string): Promise<Credentials> {
  const { data } = await axios.post<TripleATokenResponse>(
    OAUTH_TOKEN_URL,
    new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
    }).toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
    },
  )
  if (typeof data?.access_token !== 'string' || !data.access_token) {
    throw new Error('Triple-A token response carried no access_token.')
  }
  return {
    accessToken: data.access_token,
    expiresAt:
      typeof data.expires_in === 'number'
        ? new Date(Date.now() + data.expires_in * 1000)
        : undefined,
    extra: { clientId, clientSecret },
  }
}

export async function exchangeTripleACredentials(
  fields: Record<string, string>,
): Promise<Credentials> {
  const clientId = (fields.clientId ?? '').trim()
  const clientSecret = (fields.clientSecret ?? '').trim()
  if (!clientId || !clientSecret) {
    throw new Error('Client ID and client secret are required for Triple-A.')
  }
  return mintToken(clientId, clientSecret)
}

export async function refreshTripleACredentials(credentials: Credentials): Promise<Credentials> {
  const extra = (credentials.extra ?? {}) as Record<string, unknown>
  const clientId = typeof extra.clientId === 'string' ? extra.clientId : ''
  const clientSecret = typeof extra.clientSecret === 'string' ? extra.clientSecret : ''
  if (!clientId || !clientSecret) {
    throw new Error(
      'Triple-A connection has no stored client credentials to mint a new token with; reconnect it.',
    )
  }
  return mintToken(clientId, clientSecret)
}
