import type { Credentials } from '../../adapter/interface'
import { CLEAR_SETTINGS_URL } from './constants'

// Clear uses auth tokens passed as Authorization header.
// There is no OAuth2 flow. The "code" is the auth token itself.

export function buildAuthUrl(_state: string): string {
  return CLEAR_SETTINGS_URL
}

export async function exchangeCode(code: string): Promise<Credentials> {
  return {
    accessToken: code,
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // Clear auth tokens don't expire — return as-is
  return credentials
}
