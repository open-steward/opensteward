import type { Credentials } from '../../adapter/interface'
import { ENVIAYA_DASHBOARD_URL } from './constants'

/**
 * EnviaYa uses HTTP Basic Auth with the API key as the username and no
 * password.  There is no OAuth2 flow.
 *
 * getAuthUrl:           Returns the EnviaYa profile page (no redirect flow).
 * exchangeApiKey:       Treats the "code" parameter as the API key and stores
 *                       it directly as the access token.
 * refreshCredentials:   API keys never expire; returns the existing credentials.
 */

export function buildAuthUrl(_state: string): string {
  // EnviaYa has no OAuth2 flow — direct users to their API keys page.
  return ENVIAYA_DASHBOARD_URL
}

export async function exchangeApiKey(apiKey: string): Promise<Credentials> {
  // The API key IS the credential — no exchange needed.
  return {
    accessToken: apiKey,
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // EnviaYa API keys do not expire.
  return credentials
}

/**
 * Build the Authorization header value for EnviaYa requests.
 * EnviaYa supports both Basic Auth (api_key as username) and Bearer token.
 * We use Bearer for header-based auth.
 */
export function authHeader(apiKey: string): string {
  return `Bearer ${apiKey}`
}
