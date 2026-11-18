import type { Credentials } from '../../adapter/interface'
import { CLICKPOST_DASHBOARD_URL } from './constants'

/**
 * ClickPost uses API key + username authentication.
 *
 * Credentials are passed as query parameters on every request:
 *   ?key=<api-key>&username=<username>
 *
 * getAuthUrl:          Returns the ClickPost settings page (no redirect flow).
 * exchangeApiKey:      Stores the API key as the access token; username stored in extras.
 * refreshCredentials:  API keys do not expire; returns the existing credentials unchanged.
 */

export function buildAuthUrl(_state: string): string {
  // ClickPost has no OAuth2 flow — direct users to their account settings page.
  return CLICKPOST_DASHBOARD_URL
}

export async function exchangeApiKey(
  apiKey: string,
  username?: string,
): Promise<Credentials> {
  return {
    accessToken: apiKey,
    ...(username ? { extra: { username } } : {}),
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // ClickPost API keys do not expire.
  return credentials
}
