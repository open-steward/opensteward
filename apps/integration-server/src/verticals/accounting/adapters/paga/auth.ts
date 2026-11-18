import type { Credentials } from '../../adapter/interface'
import { PAGA_SETTINGS_URL } from './constants'

// Paga Business API uses API key + credential hash for authentication.
// The accessToken stores the API key; the hash is computed per-request.

export function buildAuthUrl(_state: string): string {
  return PAGA_SETTINGS_URL
}

export async function exchangeCode(code: string): Promise<Credentials> {
  return {
    accessToken: code,
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // Paga API keys do not expire — return as-is
  return credentials
}
