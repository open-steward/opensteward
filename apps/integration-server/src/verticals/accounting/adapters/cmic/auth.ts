import type { Credentials } from '../../adapter/interface'
import { CMIC_SETTINGS_URL } from './constants'

// CMiC uses API key authentication. Obtain a key from the CMiC API settings panel.

export function buildAuthUrl(_state: string): string {
  return CMIC_SETTINGS_URL
}

export async function exchangeCode(code: string): Promise<Credentials> {
  // The "code" is the API key itself
  return {
    accessToken: code,
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // CMiC API keys don't expire — return as-is
  return credentials
}
