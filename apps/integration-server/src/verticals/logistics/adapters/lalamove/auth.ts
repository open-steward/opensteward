import type { Credentials } from '../../adapter/interface'
import { LALAMOVE_DASHBOARD_URL } from './constants'

/**
 * Lalamove uses HMAC signature authentication.
 * The API key and secret are stored together as `apiKey:secret` in accessToken.
 *
 * buildAuthUrl:       Returns the Lalamove developer dashboard.
 * exchangeApiKey:     Stores apiKey:secret as the access token.
 * refreshCredentials: Keys do not expire; returns unchanged.
 */

export function buildAuthUrl(_state: string): string {
  return LALAMOVE_DASHBOARD_URL
}

export async function exchangeApiKey(apiKey: string): Promise<Credentials> {
  // apiKey should be in format "apiKey:secret"
  return { accessToken: apiKey }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}

export function authHeader(apiKey: string): string {
  return `Bearer ${apiKey}`
}
