/**
 * WhiteBooks authentication — OAuth 2.0 client-credentials grant.
 *
 * Flow:
 *   POST /gst/oauth/token  (grant_type=client_credentials)
 *   → { access_token, refresh_token, expires_in }
 *   All subsequent calls: Authorization: Bearer <access_token>
 *
 * Docs: https://whitebooks.in/api/gst/gst-api-oauth-2-0
 */

import axios from 'axios'
import { WHITEBOOKS_TOKEN_URL } from './constants'
import type { Credentials } from '../../adapter/interface'
import { parseTokenResponse } from '@opensteward/shared'

/**
 * Exchange client_id + client_secret for a bearer token.
 * The returned Credentials.accessToken is the Bearer token.
 * extra.clientId and extra.clientSecret are stored so refreshCredentials
 * can re-run the grant without re-prompting the user.
 */
export async function exchangeClientCredentials(
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  const { data } = await axios.post<Record<string, unknown>>(
    WHITEBOOKS_TOKEN_URL,
    new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
    },
  )
  const creds = parseTokenResponse(data)
  // Persist credentials so the adapter can refresh without re-prompting.
  creds.extra = { clientId, clientSecret }
  return creds
}

/**
 * Re-run the client-credentials grant to obtain a fresh bearer token.
 * WhiteBooks tokens expire after 1 hour; refresh tokens are valid for 24 h,
 * but re-running the grant is always safe.
 */
export async function refreshAccessToken(credentials: Credentials): Promise<Credentials> {
  const { clientId, clientSecret } = (credentials.extra ?? {}) as {
    clientId?: string
    clientSecret?: string
  }
  if (!clientId || !clientSecret) {
    throw new Error(
      'WhiteBooks: cannot refresh — client_id / client_secret missing from credentials.extra. Re-authenticate.',
    )
  }
  return exchangeClientCredentials(clientId, clientSecret)
}
