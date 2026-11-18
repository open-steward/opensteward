/**
 * TrueLayer Payments API v3 authentication.
 *
 * The Payments API v3 has no authorization-code flow. Its token is
 * "Option 3 to generate an `access_token` for the Payments API v3." at
 * POST https://auth.truelayer.com/connect/token
 * (https://docs.truelayer.com/reference/generateaccesstoken). The request
 * body is JSON ("application/json") and ClientCredentialsGrantRequest requires
 * `grant_type`, `client_id`, `client_secret` and `scope`:
 *
 * - grant_type: "The grant type to use must be `client_credentials`"
 * - client_id: "The Client ID found in TrueLayer Console"
 * - client_secret: "The Client Secret found in TrueLayer Console"
 * - scope: "A space separated list of scopes. Scopes for the Payments API
 *   v3: - `payments` ..."
 *
 * The response carries `access_token` and `expires_in` ("`access_token`
 * validity in seconds."). There is no refresh token for this grant, so the
 * client id and secret live on `credentials.extra` and the client mints a new
 * token when the current one expires.
 */
import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { OAUTH_TOKEN_URL, PAYMENTS_SCOPE } from './constants'

export interface TrueLayerExtra {
  clientId: string
  clientSecret: string
  /**
   * The merchant account that GET /v3/merchant-accounts/{id}/transactions
   * requires as its `{id}` path parameter. Not part of the documented auth,
   * so the Connect form does not ask for it; kept when a caller submits it.
   */
  merchantAccountId?: string
}

interface TokenResponse {
  access_token: string
  expires_in?: number
  token_type?: string
  scope?: string
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

export function readExtra(credentials: Credentials): TrueLayerExtra {
  const extra = (credentials.extra ?? {}) as Record<string, unknown>
  const merchantAccountId = str(extra.merchantAccountId)
  return {
    clientId: str(extra.clientId),
    clientSecret: str(extra.clientSecret),
    ...(merchantAccountId ? { merchantAccountId } : {}),
  }
}

export async function mintToken(extra: TrueLayerExtra): Promise<Credentials> {
  if (!extra.clientId || !extra.clientSecret) {
    throw new Error('TrueLayer needs a client id and client secret to create an access token.')
  }
  const { data } = await axios.post<TokenResponse>(
    OAUTH_TOKEN_URL,
    {
      grant_type: 'client_credentials',
      client_id: extra.clientId,
      client_secret: extra.clientSecret,
      scope: PAYMENTS_SCOPE,
    },
    {
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      timeout: 30_000,
    },
  )
  if (typeof data?.access_token !== 'string' || data.access_token === '') {
    throw new Error('TrueLayer token response carried no access_token.')
  }
  return {
    accessToken: data.access_token,
    ...(typeof data.expires_in === 'number'
      ? { expiresAt: new Date(Date.now() + data.expires_in * 1000) }
      : {}),
    ...(typeof data.scope === 'string' ? { scope: data.scope } : {}),
    extra: { ...extra },
  }
}

/** Connect-form exchange: validate the client credentials by minting a first token. */
export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const clientId = str(fields.clientId)
  const clientSecret = str(fields.clientSecret)
  if (!clientId || !clientSecret) throw new Error('Client ID and Client Secret are required.')
  const merchantAccountId = str(fields.merchantAccountId)
  return mintToken({ clientId, clientSecret, ...(merchantAccountId ? { merchantAccountId } : {}) })
}
