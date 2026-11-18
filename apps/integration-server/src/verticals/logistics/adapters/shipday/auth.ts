import type { Credentials } from '../../adapter/interface'
import { SHIPDAY_DASHBOARD_URL } from './constants'

/**
 * Shipday uses a flat API key (no OAuth).
 * The key is used as the HTTP Basic auth username with an empty password.
 */
export function buildAuthUrl(_state: string): string {
  return SHIPDAY_DASHBOARD_URL
}

export async function exchangeApiKey(apiKey: string): Promise<Credentials> {
  return { accessToken: apiKey }
}

export async function refreshCredentials(c: Credentials): Promise<Credentials> {
  return c
}
