import type { Credentials } from '../../adapter/interface'
import { SUPERFAKTURA_SETTINGS_URL } from './constants'

// SuperFaktura uses custom SFAPI key authentication — no OAuth flow.
// The "code" passed to exchangeCode is the SFAPI key (apikey field).

export function buildAuthUrl(_state: string): string {
  return SUPERFAKTURA_SETTINGS_URL
}

export async function exchangeCode(code: string): Promise<Credentials> {
  // code is "email:apikey" — colon-separated
  const idx = code.indexOf(':')
  const email = idx !== -1 ? code.slice(0, idx) : code
  const apiKey = idx !== -1 ? code.slice(idx + 1) : ''
  return { accessToken: apiKey, extra: { email } }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // SFAPI keys do not expire; return credentials unchanged
  return credentials
}
