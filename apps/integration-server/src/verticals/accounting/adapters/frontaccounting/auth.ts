import type { Credentials } from '../../adapter/interface'
import { FRONTACCOUNTING_SETTINGS_URL } from './constants'

// FrontAccounting uses a token-based REST API.
// The API key is used directly as the access token.

export function buildAuthUrl(_state: string): string {
  return FRONTACCOUNTING_SETTINGS_URL
}

export async function exchangeCode(code: string): Promise<Credentials> {
  return { accessToken: code }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
