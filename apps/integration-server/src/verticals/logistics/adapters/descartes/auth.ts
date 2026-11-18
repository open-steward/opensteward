import type { Credentials } from '../../adapter/interface'
import { DESCARTES_DASHBOARD_URL } from './constants'

/**
 * Descartes uses long-lived API keys (no OAuth flow).
 * The caller passes their key directly; we treat it as the access token.
 */
export function buildAuthUrl(_state: string): string {
  return DESCARTES_DASHBOARD_URL
}

export async function exchangeApiKey(apiKey: string): Promise<Credentials> {
  return { accessToken: apiKey }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // API keys do not expire — return as-is.
  return credentials
}
