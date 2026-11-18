import type { Credentials } from '../../adapter/interface'
import { KORA_SETTINGS_URL } from './constants'

// Kora uses API key authentication (secret key in Authorization header).
// The "code" supplied in the exchange flow is the secret key itself.

export function buildAuthUrl(_state: string): string {
  return KORA_SETTINGS_URL
}

export async function exchangeCode(code: string): Promise<Credentials> {
  return {
    accessToken: code,
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // Kora API keys do not expire — return as-is
  return credentials
}
