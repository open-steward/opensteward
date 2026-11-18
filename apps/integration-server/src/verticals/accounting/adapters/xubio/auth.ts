import axios from 'axios'
import { XUBIO_TOKEN_URL } from './constants'
import type { Credentials } from '../../adapter/interface'

// Xubio uses OAuth2 client_credentials grant with Client-ID and Secret-ID.
// No authorization code flow — tokens are obtained directly with client credentials.

export function buildAuthUrl(_state: string): string {
  // Xubio does not support authorization code flow.
  // Credentials are configured directly (clientId / clientSecret).
  return 'https://xubio.com/API/documentation/index.html'
}

function parseTokenResponse(data: Record<string, unknown>): Credentials {
  return {
    accessToken: data['access_token'] as string,
    expiresAt: new Date(Date.now() + (data['expires_in'] as number) * 1000),
  }
}

export async function exchangeCode(code: string): Promise<Credentials> {
  // code is expected to be "clientId:clientSecret"
  const [clientId, clientSecret] = code.split(':')
  return getClientCredentialsToken(clientId, clientSecret)
}

export async function getClientCredentialsToken(
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  const { data } = await axios.post<Record<string, unknown>>(
    XUBIO_TOKEN_URL,
    new URLSearchParams({ grant_type: 'client_credentials' }),
    {
      auth: { username: clientId, password: clientSecret },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    },
  )
  return parseTokenResponse(data)
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // Xubio tokens expire in 3600s; re-request using stored clientId:clientSecret
  // Since there is no refresh_token, we re-use the accessToken until it expires.
  return credentials
}
