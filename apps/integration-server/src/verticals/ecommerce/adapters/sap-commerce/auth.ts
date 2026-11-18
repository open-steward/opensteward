/**
 * SAP Commerce Cloud OAuth2 helpers.
 *
 * SAP Commerce Cloud supports two OAuth2 grant types for API access:
 *  1. `client_credentials` — server-to-server (back-office integrations)
 *  2. `password` — user-scoped (customer-facing; less common for adapters)
 *
 * This adapter uses `client_credentials`. The caller configures an OAuth
 * client in Backoffice/HAC and supplies `{host, baseSiteId, clientId,
 * clientSecret}` directly; the adapter exchanges them for a Bearer token
 * against `https://{host}/authorizationserver/oauth/token`.
 *
 * Tokens typically live ~12h (`expires_in: 43200`).
 *
 * Docs: https://help.sap.com/docs/SAP_COMMERCE
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { TOKEN_BUFFER_MS, DEFAULT_BASE_SITE } from './constants'

interface SapTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  scope?: string
}

export interface SapCommerceAuthInput {
  host: string
  baseSiteId?: string
  clientId: string
  clientSecret: string
  /** Optional: username for password grant. */
  username?: string
  /** Optional: password for password grant. */
  password?: string
}

/**
 * Exchange a client_credentials grant for a Bearer token. The resulting
 * Credentials embed host/baseSiteId/clientId/clientSecret under `extra`
 * so `refreshCredentials` can re-authenticate without fresh input.
 */
export async function requestToken(input: SapCommerceAuthInput): Promise<Credentials> {
  const { host, baseSiteId, clientId, clientSecret } = input
  const tokenUrl = `https://${host}/authorizationserver/oauth/token`

  const params = new URLSearchParams()
  params.set('grant_type', 'client_credentials')
  params.set('client_id', clientId)
  params.set('client_secret', clientSecret)

  const { data } = await axios.post<SapTokenResponse>(
    tokenUrl,
    params.toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
    },
  )

  const expiresAt = new Date(Date.now() + data.expires_in * 1000 - TOKEN_BUFFER_MS)
  return {
    accessToken: data.access_token,
    expiresAt,
    scope: data.scope,
    extra: {
      host,
      baseSiteId: baseSiteId ?? DEFAULT_BASE_SITE,
      clientId,
      clientSecret,
    },
  }
}
