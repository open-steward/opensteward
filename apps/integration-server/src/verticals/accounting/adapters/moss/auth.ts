/**
 * Moss auth — OAuth 2.0 client credentials flow.
 *
 * Moss issues API keys as a (client_id / kid_*, client_secret / sk_*) pair.
 * Tokens are JWTs that expire after 3600 s. The adapter re-fetches a token
 * on every refreshCredentials call; there is no refresh_token.
 *
 * Docs: https://developers.getmoss.com/
 */

import type { Credentials } from '../../adapter/interface'
import { MOSS_TOKEN_URL } from './constants'

export async function fetchToken(
  clientId: string,
  clientSecret: string,
  scope = 'read write',
): Promise<Credentials> {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope,
  })

  const res = await fetch(MOSS_TOKEN_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
    },
    body: body.toString(),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Moss token endpoint returned ${res.status}: ${text}`)
  }

  const json = (await res.json()) as {
    access_token: string
    expires_in?: number
    scope?: string
  }

  const expiresAt =
    typeof json.expires_in === 'number'
      ? new Date(Date.now() + json.expires_in * 1000)
      : undefined

  return {
    accessToken: json.access_token,
    expiresAt,
    scope: json.scope,
    // Store credentials so refreshCredentials can re-run the grant
    extra: { clientId, clientSecret },
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const clientId = credentials.extra?.['clientId'] as string | undefined
  const clientSecret = credentials.extra?.['clientSecret'] as string | undefined
  if (!clientId || !clientSecret) {
    throw new Error('Moss: clientId and clientSecret are required to refresh the token')
  }
  return fetchToken(clientId, clientSecret)
}
