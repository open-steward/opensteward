import axios from 'axios'
import { SIIGO_TOKEN_URL } from './constants'
import type { Credentials } from '../../adapter/interface'

// Siigo uses username + access_key authentication (not OAuth authorization code flow).
// A POST to /auth with JSON body {username, access_key} returns a Bearer token valid for 24h.

export function buildAuthUrl(_state: string): string {
  // Siigo does not use OAuth authorization code flow.
  return 'https://developers.siigo.com/'
}

function parseTokenResponse(data: Record<string, unknown>): Credentials {
  return {
    accessToken: data['access_token'] as string,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
  }
}

export async function exchangeCode(code: string): Promise<Credentials> {
  // code is expected to be "username:access_key"
  const colonIdx = code.indexOf(':')
  const username = code.slice(0, colonIdx)
  const accessKey = code.slice(colonIdx + 1)
  return signIn(username, accessKey)
}

export async function signIn(username: string, accessKey: string): Promise<Credentials> {
  const { data } = await axios.post<Record<string, unknown>>(
    SIIGO_TOKEN_URL,
    { username, access_key: accessKey },
    { headers: { 'Content-Type': 'application/json', 'Partner-Id': 'open-accounting-integration' } },
  )
  return parseTokenResponse(data)
}

export async function refreshAccessToken(
  _refreshToken: string,
  username: string,
  accessKey: string,
): Promise<Credentials> {
  // Siigo has no refresh token — re-authenticate with the same credentials
  return signIn(username, accessKey)
}
