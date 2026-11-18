import axios from 'axios'
import { EBOEKHOUDEN_API_BASE } from './constants'
import type { Credentials } from '../../adapter/interface'

// e-Boekhouden uses username + security code to get a session token.
// We repurpose the code-exchange flow: "code" = "username:securityCode"

export function buildAuthUrl(_clientId: string, _redirectUri: string, _scopes: string[], state: string): string {
  return `https://www.e-boekhouden.nl/api?state=${encodeURIComponent(state)}`
}

export async function exchangeCode(code: string): Promise<Credentials> {
  const colonIdx = code.indexOf(':')
  if (colonIdx === -1) throw new Error('e-Boekhouden code must be "username:securityCode"')
  const username = code.slice(0, colonIdx)
  const securityCode = code.slice(colonIdx + 1)

  const { data } = await axios.post<{ token: string; expireDate: string }>(
    `${EBOEKHOUDEN_API_BASE}/auth/session`,
    { username, securityCode },
    { headers: { 'Content-Type': 'application/json', Accept: 'application/json' } },
  )
  return {
    accessToken: data.token,
    refreshToken: code, // store original credentials for re-auth
    expiresAt: data.expireDate ? new Date(data.expireDate) : undefined,
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // Re-authenticate using stored credentials
  return exchangeCode(credentials.refreshToken ?? '')
}
