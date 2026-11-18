import type { Credentials } from '../../adapter/interface'
import { NATIONEX_DASHBOARD_URL } from './constants'

export function buildAuthUrl(_state: string): string {
  return NATIONEX_DASHBOARD_URL
}

/**
 * Nationex authenticates with a Bearer API key.
 */
export async function exchangeApiKey(apiKey: string): Promise<Credentials> {
  return { accessToken: apiKey }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
