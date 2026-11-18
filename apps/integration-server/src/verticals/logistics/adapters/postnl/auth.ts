import type { Credentials } from '../../adapter/interface'
import { POSTNL_DASHBOARD_URL } from './constants'

export function buildAuthUrl(_state: string): string {
  return POSTNL_DASHBOARD_URL
}

export async function exchangeApiKey(apiKey: string): Promise<Credentials> {
  return { accessToken: apiKey }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}

/**
 * PostNL uses a custom `apikey` header rather than Authorization.
 * Returns the raw API key; client.ts sets the `apikey` header directly.
 */
export function authHeader(apiKey: string): string {
  return apiKey
}
