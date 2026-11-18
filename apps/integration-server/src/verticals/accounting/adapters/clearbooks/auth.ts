import type { Credentials } from '../../adapter/interface'
import { CLEARBOOKS_SETTINGS_URL } from './constants'

// Clear Books uses API keys generated from the Clear Books settings panel.
// There is no OAuth2 flow. The "code" is the API key itself.

export function buildAuthUrl(_state: string): string {
  return CLEARBOOKS_SETTINGS_URL
}

export async function exchangeCode(code: string): Promise<Credentials> {
  return {
    accessToken: code,
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // Clear Books API keys don't expire — return as-is
  return credentials
}
