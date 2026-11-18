/**
 * Interswitch Passport authentication (OAuth 2.0 client credentials).
 *
 * docs/authentication.md documents one OAuth flow: "convert your client ID and
 * secret key into a Base64 encoded string … concatenating the client ID and
 * secret key with a colon (:)", then
 *
 *   curl -X POST '…/passport/oauth/token?grant_type=client_credentials' \
 *     -H "Authorization: Basic <base64>" \
 *     -H "Content-Type: application/x-www-form-urlencoded" \
 *     -d 'grant_type=client_credentials'
 *
 * The documented response carries `access_token`, `expires_in` ("This value
 * is in seconds") and `merchant_code` — and no `refresh_token`. There is no
 * documented user-consent authorize endpoint, so the connection holds the
 * client ID and secret key and re-mints the token when it expires.
 *
 * `merchant_code` is what the transactions list requires as `merchantCode`, so
 * it is kept on `credentials.extra` from the token response.
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { TOKEN_URL } from './constants'

export interface InterswitchExtra {
  clientId: string
  secretKey: string
  merchantCode: string
}

interface PassportTokenResponse {
  access_token: string
  token_type?: string
  expires_in?: number
  scope?: string
  merchant_code?: string
}

export function readExtra(credentials: Credentials): Partial<InterswitchExtra> {
  const extra = (credentials.extra ?? {}) as Record<string, unknown>
  const str = (v: unknown) => (typeof v === 'string' && v !== '' ? v : undefined)
  return {
    clientId: str(extra['clientId']),
    secretKey: str(extra['secretKey']),
    merchantCode: str(extra['merchantCode']),
  }
}

export async function mintToken(clientId: string, secretKey: string): Promise<Credentials> {
  const basic = Buffer.from(`${clientId}:${secretKey}`).toString('base64')
  const { data } = await axios.post<PassportTokenResponse>(
    TOKEN_URL,
    new URLSearchParams({ grant_type: 'client_credentials' }).toString(),
    {
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
    },
  )
  if (typeof data.merchant_code !== 'string' || data.merchant_code === '') {
    throw new Error(
      'Interswitch Passport token response carried no merchant_code; the transactions list requires merchantCode.',
    )
  }
  return {
    accessToken: data.access_token,
    expiresAt:
      typeof data.expires_in === 'number'
        ? new Date(Date.now() + data.expires_in * 1000)
        : undefined,
    scope: data.scope,
    extra: { clientId, secretKey, merchantCode: data.merchant_code },
  }
}

/** Connect-form exchange: validate the pair and mint the first token. */
export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const clientId = (fields['clientId'] ?? '').trim()
  const secretKey = (fields['secretKey'] ?? '').trim()
  if (!clientId || !secretKey) throw new Error('Interswitch client ID and secret key are required.')
  return mintToken(clientId, secretKey)
}

/** No refresh_token is issued; re-mint from the stored client credentials. */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const { clientId, secretKey } = readExtra(credentials)
  if (!clientId || !secretKey) return credentials
  return mintToken(clientId, secretKey)
}
