import type { Credentials } from '../../adapter/interface'
import { TRACK_POD_DASHBOARD_URL } from './constants'

/**
 * Track-POD uses a static API key.  No OAuth exchange is required.
 * Users obtain their key from Settings > Integrations > Web API.
 */
export function buildAuthUrl(_state: string): string {
  return TRACK_POD_DASHBOARD_URL
}

export async function exchangeApiKey(apiKey: string): Promise<Credentials> {
  return { accessToken: apiKey }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // API keys do not expire — nothing to refresh.
  return credentials
}
