/**
 * LiveHelpNow OAuth 2.0 client_credentials auth.
 *
 * LiveHelpNow uses OAuth 2.0 client_credentials as its only auth mechanism.
 * The caller supplies a client_id + client_secret; we exchange them for a
 * Bearer access token at connect-time and store it in credentials.accessToken.
 *
 * Docs: https://developer.livehelpnow.net/docs/api/info/authentication/oauth
 */
import axios from 'axios'
import type { Credentials, CredentialField } from '@opensteward/shared'
import { OAUTH_TOKEN_URL } from './constants'

export function getAuthUrlUnsupported(): never {
  throw new Error('livehelpnow uses OAuth client_credentials; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'clientId',
      label: 'Client ID',
      type: 'text',
      required: true,
      helpText: 'OAuth2 client_id obtained from your LiveHelpNow app settings.',
    },
    {
      name: 'clientSecret',
      label: 'Client Secret',
      type: 'password',
      required: true,
      helpText: 'OAuth2 client_secret obtained from your LiveHelpNow app settings.',
    },
  ]
}

interface TokenResponse {
  access_token: string
  expires_in?: number
  token_type?: string
  refresh_token?: string
  refresh_expires_in?: number
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const clientId = fields['clientId']
  const clientSecret = fields['clientSecret']
  if (!clientId || !clientSecret) {
    throw new Error('livehelpnow credentialFields require clientId and clientSecret')
  }

  const { data } = await axios.post<TokenResponse>(
    OAUTH_TOKEN_URL,
    new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    },
  )

  return {
    accessToken: data.access_token,
    extra: {
      clientId,
      clientSecret,
      expiresIn: String(data.expires_in ?? ''),
      refreshToken: data.refresh_token ?? '',
    },
  }
}
