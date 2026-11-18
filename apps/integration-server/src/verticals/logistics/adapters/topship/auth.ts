import type { Credentials } from '../../adapter/interface'
import { TOPSHIP_DASHBOARD_URL } from './constants'

/**
 * Topship uses API key authentication — not OAuth2.
 *
 * getAuthUrl:          Returns the Topship settings page (no redirect flow).
 * exchangeCode:        Treats the "code" parameter as the API key and stores it
 *                      directly as the access token.
 * refreshCredentials:  API keys never expire; returns the existing credentials.
 */

export function buildAuthUrl(_state: string): string {
  // Topship has no OAuth2 flow — direct users to their API keys page.
  return TOPSHIP_DASHBOARD_URL
}

export async function exchangeApiKey(apiKey: string): Promise<Credentials> {
  // The API key IS the credential — no exchange needed.
  return {
    accessToken: apiKey,
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // Topship API keys do not expire.
  return credentials
}

/**
 * Build the Authorization header value for Topship requests.
 * Topship uses the API key as a Bearer token.
 */
export function authHeader(apiKey: string): string {
  return `Bearer ${apiKey}`
}
