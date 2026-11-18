import type { Credentials } from '../../adapter/interface'
import { FOUNDATION_SETTINGS_URL } from './constants'

// Foundation uses API keys generated from the Foundation settings panel.
// There is no OAuth2 flow. The "code" is the API key itself.

export function buildAuthUrl(_state: string): string {
  return FOUNDATION_SETTINGS_URL
}

export async function exchangeCode(code: string): Promise<Credentials> {
  return {
    accessToken: code,
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // Foundation API keys don't expire — return as-is
  return credentials
}
