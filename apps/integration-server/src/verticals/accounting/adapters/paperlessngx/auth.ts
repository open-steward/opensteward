import type { Credentials } from '../../adapter/interface'
import { PAPERLESSNGX_SETTINGS_URL } from './constants'

// Paperless-ngx uses API tokens generated in the user settings panel.
// The "code" passed during auth exchange is the API token.

export function buildAuthUrl(_state: string): string {
  return PAPERLESSNGX_SETTINGS_URL
}

export async function exchangeCode(code: string): Promise<Credentials> {
  return { accessToken: code }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // Paperless-ngx tokens do not expire
  return credentials
}
