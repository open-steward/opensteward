/**
 * Ora API key authentication.
 *
 * Ora uses an OAuth2 application model: the user creates an app inside their
 * Organisation and receives a client_id + client_secret. Credentials are
 * supplied as static fields (no browser redirect required for server-to-server
 * use); the client exchanges them for a Bearer access token at the token
 * endpoint.
 *
 * Token endpoint: POST https://api.ora.pm/oauth/token
 *   grant_type=client_credentials
 *
 * The access token is short-lived. When it expires (or a 401 is returned),
 * exchangeCredentials() can be called again with the same fields to obtain a
 * fresh token.
 *
 * Docs: https://ora.pm/docs/getting-started-with-ora-public-api
 */
import axios from 'axios'
import type { Credentials, CredentialField } from '@opensteward/shared'
import { OAUTH_TOKEN_URL } from './constants'

export function getAuthUrlUnsupported(): never {
  throw new Error('Ora uses API key auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'clientId',
      label: 'Client ID',
      type: 'text',
      required: true,
    },
    {
      name: 'clientSecret',
      label: 'Client Secret',
      type: 'password',
      required: true,
    },
  ]
}

interface OraTokenResponse {
  access_token: string
  refresh_token?: string
  token_type?: string
  expires_in?: number
  scope?: string
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const { clientId, clientSecret } = fields
  if (!clientId || !clientSecret) {
    throw new Error('Ora credentials require clientId and clientSecret')
  }
  const { data } = await axios.post<OraTokenResponse>(
    OAUTH_TOKEN_URL,
    new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  )
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined,
    scope: data.scope,
    extra: { clientId, clientSecret },
  }
}

export async function refreshStoredCredentials(credentials: Credentials): Promise<Credentials> {
  // Re-exchange using the stored client credentials
  const clientId = credentials.extra?.['clientId'] as string | undefined
  const clientSecret = credentials.extra?.['clientSecret'] as string | undefined
  if (!clientId || !clientSecret) return credentials
  return exchangeCredentials({ clientId, clientSecret })
}
