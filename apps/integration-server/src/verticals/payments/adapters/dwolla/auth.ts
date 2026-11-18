/**
 * Dwolla auth — OAuth 2 client-credentials grant only.
 *
 * https://developers.dwolla.com/docs/api-reference/api-fundamentals/making-requests-and-authentication:
 * "OAuth 2 defines four main authorization grant types. Dwolla implements one:
 * **Application authorization** — using the client credentials grant, your
 * application obtains authorization to interact with the API on its own behalf."
 *
 * "To obtain an access token, send a `POST` to `/token` with an HTTP Basic
 * `Authorization` header containing your Base64-encoded client credentials.
 * [...] The request body must be form-encoded and include
 * `grant_type=client_credentials`"
 *
 * "Application access tokens expire one hour after they're issued and are not
 * paired with a refresh token. To continue making API calls, exchange your
 * client credentials for a new token using the same request shown above."
 * So the client id / secret are kept on `credentials.extra` and a refresh
 * re-mints the token.
 */

import axios from 'axios'
import type { CredentialField, Credentials } from '@opensteward/shared'
import { TOKEN_URL } from './constants'

export const DWOLLA_CREDENTIAL_FIELDS: CredentialField[] = [
  {
    name: 'clientId',
    label: 'Client ID',
    type: 'text',
    required: true,
    helpText: 'Application key (client_id) from the applications page of the Dwolla dashboard.',
  },
  {
    name: 'clientSecret',
    label: 'Client secret',
    type: 'password',
    required: true,
    helpText: 'Application secret (client_secret), shown alongside the client ID.',
  },
]

/** Documented 200 body of POST /token: access_token, token_type, expires_in. */
interface DwollaTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
}

async function mintToken(clientId: string, clientSecret: string): Promise<Credentials> {
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const { data } = await axios.post<DwollaTokenResponse>(
    TOKEN_URL,
    new URLSearchParams({ grant_type: 'client_credentials' }).toString(),
    {
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    },
  )
  if (typeof data?.access_token !== 'string' || !data.access_token) {
    throw new Error('Dwolla token response carried no access_token.')
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

export async function exchangeDwollaCredentials(
  fields: Record<string, string>,
): Promise<Credentials> {
  const clientId = (fields.clientId ?? '').trim()
  const clientSecret = (fields.clientSecret ?? '').trim()
  if (!clientId || !clientSecret) {
    throw new Error('Client ID and client secret are required for Dwolla.')
  }
  return mintToken(clientId, clientSecret)
}

export async function refreshDwollaCredentials(credentials: Credentials): Promise<Credentials> {
  const extra = (credentials.extra ?? {}) as Record<string, unknown>
  const clientId = typeof extra.clientId === 'string' ? extra.clientId : ''
  const clientSecret = typeof extra.clientSecret === 'string' ? extra.clientSecret : ''
  if (!clientId || !clientSecret) {
    throw new Error(
      'Dwolla connection has no stored client credentials to mint a new token with; reconnect it.',
    )
  }
  return mintToken(clientId, clientSecret)
}

/** The application's client id, for keying per-connection state. */
export function clientIdOf(credentials: Credentials): string {
  const extra = (credentials.extra ?? {}) as Record<string, unknown>
  return typeof extra.clientId === 'string' ? extra.clientId : ''
}
