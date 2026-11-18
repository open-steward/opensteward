import type { Credentials } from '../../adapter/interface'
import { ECOUNT_SETTINGS_URL } from './constants'

// Ecount uses API key + company code + user ID. The "code" is the API key itself.
// Session-based auth: API key is exchanged for a session ID at login.
// For simplicity, the API key is stored as the accessToken.

export function buildAuthUrl(_state: string): string {
  return ECOUNT_SETTINGS_URL
}

export async function exchangeCode(code: string): Promise<Credentials> {
  return {
    accessToken: code,
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // Ecount API keys don't expire — return as-is
  return credentials
}
