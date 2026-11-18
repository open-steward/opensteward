/**
 * Gold-Vision auth helpers.
 *
 * Gold-Vision uses OAuth 2.0 client credentials grant.  The caller supplies a
 * Client ID, Client Secret, and their instance URL (e.g.
 * https://mycompany.goldvisioncrm.com).  Tokens expire in 3 600 s and are
 * refreshed automatically by re-running the client-credentials grant.
 *
 * Docs: https://help.gold-vision.com/gold-vision-api/requesting-an-access-token/
 */

import type { Credentials } from '@opensteward/shared'
import { GV_TOKEN_URL, GV_SCOPE } from './constants'

interface GvTokenResponse {
  access_token: string
  token_type: string
  expires_in?: number
}

export async function fetchAccessToken(
  clientId: string,
  clientSecret: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<Credentials> {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope: GV_SCOPE,
  })

  const res = await fetchImpl(GV_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body: body.toString(),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Gold-Vision token request failed (${res.status}): ${text}`)
  }

  const json = (await res.json()) as GvTokenResponse
  const expiresAt =
    typeof json.expires_in === 'number'
      ? new Date(Date.now() + json.expires_in * 1000)
      : undefined

  return {
    accessToken: json.access_token,
    expiresAt,
  }
}
