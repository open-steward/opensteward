import axios from 'axios'
import { POWEROFFICE_TOKEN_URL } from './constants'
import type { Credentials } from '../../adapter/interface'

// PowerOffice Go uses Client Credentials flow (no user-level OAuth)
// The "auth URL" is a no-op; operators provide client keys directly.

export function buildAuthUrl(_clientId: string, _redirectUri: string, _scopes: string[], state: string): string {
  return `https://goapi.poweroffice.net?state=${encodeURIComponent(state)}`
}

function parseTokenResponse(data: Record<string, unknown>): Credentials {
  return {
    accessToken: data['access_token'] as string,
    expiresAt: new Date(Date.now() + (data['expires_in'] as number) * 1000),
  }
}

export async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  // code is treated as "applicationKey" for PowerOffice
  const { data } = await axios.post<Record<string, unknown>>(
    POWEROFFICE_TOKEN_URL,
    new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: code, // applicationKey passed as scope placeholder
    }),
    {
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    },
  )
  return parseTokenResponse(data)
}

export async function refreshAccessToken(
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  const { data } = await axios.post<Record<string, unknown>>(
    POWEROFFICE_TOKEN_URL,
    new URLSearchParams({ grant_type: 'client_credentials' }),
    {
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    },
  )
  return parseTokenResponse(data)
}
