/**
 * Cellulant (Tingg) authentication.
 *
 * Tingg is an `api_key`-style integration with a twist: the customer holds a
 * static `apiKey` plus an OAuth2 `client_id` / `client_secret` pair. The
 * static key is sent on every call as the `apikey` header, while the
 * client-credentials pair is exchanged at the token endpoint for a short-lived
 * JWT bearer token (`access_token`). Both the JWT and the static key are
 * required on every authenticated request.
 *
 * We carry the static credentials on `credentials.extra` so the client can
 * re-mint the bearer token (it expires) and re-send the `apikey` header. The
 * minted JWT lives on `credentials.accessToken`.
 *
 * Docs: https://docs.tingg.africa/reference/authenticate-requests
 */
import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { TOKEN_PATH, baseUrlFor } from './constants'

export interface CellulantExtra {
  apiKey: string
  clientId: string
  clientSecret: string
  environment: 'sandbox' | 'production'
}

interface TokenResponse {
  access_token: string
  token_type?: string
  expires_in?: number
  refresh_token?: string
}

/** Read the static Tingg credentials stashed on `credentials.extra`. */
export function readExtra(credentials: Credentials): CellulantExtra {
  const extra = (credentials.extra ?? {}) as Partial<CellulantExtra>
  return {
    apiKey: String(extra.apiKey ?? ''),
    clientId: String(extra.clientId ?? ''),
    clientSecret: String(extra.clientSecret ?? ''),
    environment: extra.environment === 'sandbox' ? 'sandbox' : 'production',
  }
}

/**
 * Exchange the client-credentials pair for a JWT bearer token, returning a
 * full `Credentials` object with the static fields preserved on `extra`.
 */
export async function mintToken(
  apiKey: string,
  clientId: string,
  clientSecret: string,
  environment: 'sandbox' | 'production',
): Promise<Credentials> {
  const { data } = await axios.post<TokenResponse>(
    `${baseUrlFor(environment)}${TOKEN_PATH}`,
    {
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    },
    {
      headers: {
        apikey: apiKey,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    },
  )
  const expiresAt =
    typeof data.expires_in === 'number'
      ? new Date(Date.now() + data.expires_in * 1000)
      : undefined
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt,
    extra: { apiKey, clientId, clientSecret, environment },
  }
}

/**
 * Connect-form exchange. Validates the three required fields, then mints the
 * first bearer token so the connection is verified end-to-end at link time.
 */
export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const apiKey = (fields.apiKey ?? '').trim()
  const clientId = (fields.clientId ?? '').trim()
  const clientSecret = (fields.clientSecret ?? '').trim()
  const environment = fields.environment === 'sandbox' ? 'sandbox' : 'production'
  if (!apiKey) throw new Error('API key is required.')
  if (!clientId || !clientSecret) {
    throw new Error('Client ID and client secret are required.')
  }
  return mintToken(apiKey, clientId, clientSecret, environment)
}
