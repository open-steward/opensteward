import type { Credentials } from '../../adapter/interface'
import { LOGINEXT_DASHBOARD_URL } from './constants'

/**
 * LogiNext uses API-key auth: the caller passes the key directly.
 * We redirect to the dashboard when a browser flow is requested.
 */
export function buildAuthUrl(_state: string): string {
  return LOGINEXT_DASHBOARD_URL
}

export async function exchangeApiKey(apiKey: string): Promise<Credentials> {
  return { accessToken: apiKey }
}

export async function refreshCredentials(c: Credentials): Promise<Credentials> {
  // API keys do not expire — return as-is
  return c
}
