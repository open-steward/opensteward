import type { Credentials } from '../../adapter/interface'
import { ACCOUNTEER_SETTINGS_URL } from './constants'

// Accounteer uses API key authentication.
// The "code" supplied in the exchange flow is the API key itself.

export function buildAuthUrl(_state: string): string {
  return ACCOUNTEER_SETTINGS_URL
}

export async function exchangeCode(code: string): Promise<Credentials> {
  return {
    accessToken: code,
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // API keys do not expire — return as-is
  return credentials
}
