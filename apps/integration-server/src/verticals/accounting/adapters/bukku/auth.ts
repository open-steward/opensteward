import type { Credentials } from '../../adapter/interface'
import { BUKKU_SETTINGS_URL } from './constants'

// Bukku uses API tokens generated from the Bukku settings panel.
// There is no OAuth2 flow. The "code" is the API token itself.

export function buildAuthUrl(_state: string): string {
  return BUKKU_SETTINGS_URL
}

export async function exchangeCode(code: string): Promise<Credentials> {
  return {
    accessToken: code,
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // Bukku API tokens don't expire — return as-is
  return credentials
}
