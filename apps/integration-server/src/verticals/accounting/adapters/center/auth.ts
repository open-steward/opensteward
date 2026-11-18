import { CENTER_SETTINGS_URL } from './constants'
import type { Credentials } from '../../adapter/interface'

// Center uses API key authentication via the x-center-api-key header.
// There is no OAuth2 flow — the API key is provisioned through the Center developer portal.

export function buildAuthUrl(_state: string): string {
  return CENTER_SETTINGS_URL
}

export async function exchangeCode(apiKey: string): Promise<Credentials> {
  return { accessToken: apiKey }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // Center API keys do not expire — return as-is
  return credentials
}
