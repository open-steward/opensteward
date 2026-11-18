import type { Credentials } from '../../adapter/interface'
import { NEXTBILLION_DASHBOARD_URL } from './constants'

/**
 * NextBillion.ai uses API key authentication.
 *
 * The API key is passed as `?key=<apiKey>` on every request — no OAuth2
 * redirect flow exists. getAuthUrl directs users to their dashboard.
 */

export function buildAuthUrl(_state: string): string {
  return NEXTBILLION_DASHBOARD_URL
}

export async function exchangeApiKey(apiKey: string): Promise<Credentials> {
  // The API key IS the credential — no server exchange needed.
  return { accessToken: apiKey }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // API keys do not expire.
  return credentials
}
