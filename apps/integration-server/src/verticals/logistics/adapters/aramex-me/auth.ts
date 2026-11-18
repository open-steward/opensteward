import type { Credentials } from '../../adapter/interface'
import { ARAMEX_ME_DASHBOARD_URL } from './constants'

export function buildAuthUrl(_state: string): string {
  return ARAMEX_ME_DASHBOARD_URL
}

export async function exchangeApiKey(apiKey: string): Promise<Credentials> {
  // apiKey is expected to be "accountNumber:accountPin"
  return { accessToken: apiKey }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // Basic auth credentials do not expire.
  return credentials
}

/**
 * Build the Authorization header value for Aramex ME requests.
 * Uses Basic auth with base64-encoded accountNumber:accountPin.
 */
export function authHeader(accessToken: string): string {
  const encoded = Buffer.from(accessToken).toString('base64')
  return `Basic ${encoded}`
}
