/**
 * TrueCommerce OAuth 2.0 client_credentials authentication.
 *
 * TrueCommerce Foundry uses Auth0 as its identity provider.  Third-party
 * integrations obtain a machine-to-machine token via the client_credentials
 * grant; there is no interactive authorization-code flow.
 */
import axios from 'axios'
import type { Credentials, CredentialField } from '@opensteward/shared'
import { OAUTH_TOKEN_URL, OAUTH_AUDIENCE } from './constants'

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'clientId',
      label: 'Client ID',
      type: 'text',
      required: true,
      helpText: 'OAuth 2.0 Client ID issued by TrueCommerce Foundry developer portal.',
    },
    {
      name: 'clientSecret',
      label: 'Client Secret',
      type: 'password',
      required: true,
      helpText: 'OAuth 2.0 Client Secret issued by TrueCommerce Foundry developer portal.',
    },
  ]
}

interface TokenResponse {
  access_token: string
  token_type: string
  expires_in?: number
  scope?: string
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const clientId = fields['clientId']
  const clientSecret = fields['clientSecret']
  if (!clientId || !clientSecret) {
    throw new Error('truecommerce: clientId and clientSecret are required')
  }
  return fetchToken(clientId, clientSecret)
}

export async function fetchToken(clientId: string, clientSecret: string): Promise<Credentials> {
  const { data } = await axios.post<TokenResponse>(
    OAUTH_TOKEN_URL,
    new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      audience: OAUTH_AUDIENCE,
    }).toString(),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    },
  )
  const expiresAt = data.expires_in
    ? new Date(Date.now() + data.expires_in * 1000).toISOString()
    : undefined
  return {
    accessToken: data.access_token,
    scope: data.scope,
    extra: {
      clientId,
      clientSecret,
      expiresAt,
    },
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // client_credentials tokens are short-lived — re-fetch using stored client credentials.
  const { clientId, clientSecret, expiresAt } = credentials.extra as {
    clientId?: string
    clientSecret?: string
    expiresAt?: string
  }
  if (!clientId || !clientSecret) return credentials
  // Refresh if within 60 s of expiry (or expiry unknown)
  if (expiresAt) {
    const remaining = new Date(expiresAt).getTime() - Date.now()
    if (remaining > 60_000) return credentials
  }
  return fetchToken(clientId, clientSecret)
}

/** Not used — TrueCommerce uses client_credentials, not authorization-code. */
export function getAuthUrl(_clientId: string, _redirectUri: string, _state: string): never {
  throw new Error('truecommerce: uses client_credentials grant; no interactive auth URL')
}
