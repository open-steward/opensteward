import type { Credentials } from '../../adapter/interface'
import { SILA_SETTINGS_URL } from './constants'

// Sila uses private key signing (ECDSA) for authentication.
// The accessToken stores the app private key.

export function buildAuthUrl(_state: string): string {
  return SILA_SETTINGS_URL
}

export async function exchangeCode(code: string): Promise<Credentials> {
  return {
    accessToken: code,
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // Sila private keys do not expire — return as-is
  return credentials
}
