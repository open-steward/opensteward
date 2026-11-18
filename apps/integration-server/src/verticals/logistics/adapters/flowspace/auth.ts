import type { Credentials } from '../../adapter/interface'
import { FLOWSPACE_DASHBOARD_URL } from './constants'

/**
 * Flowspace uses API key authentication — not OAuth2.
 *
 * getAuthUrl:          Returns the Flowspace API keys dashboard page.
 * exchangeApiKey:      Stores the API key directly as the access token.
 * refreshCredentials:  API keys do not expire; returns existing credentials.
 */

export function buildAuthUrl(_state: string): string {
  return FLOWSPACE_DASHBOARD_URL
}

export async function exchangeApiKey(apiKey: string): Promise<Credentials> {
  return {
    accessToken: apiKey,
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}

/**
 * Build the Authorization header value for Flowspace requests.
 * Flowspace expects a standard Bearer token.
 */
export function authHeader(apiKey: string): string {
  return `Bearer ${apiKey}`
}
