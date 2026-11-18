import type { Credentials } from '../../adapter/interface'
import { NARVAR_DASHBOARD_URL } from './constants'

/**
 * Narvar uses Bearer token (API key) authentication.
 * The token is sent via `Authorization: Bearer <token>` on every request.
 *
 * Narvar has no OAuth2 redirect flow; credentials are generated in the
 * Narvar hub and pasted into the integration.
 *
 * buildAuthUrl:        Returns the Narvar hub settings page where users find their key.
 * exchangeApiKey:      Stores the raw token as the access token (no exchange needed).
 * refreshCredentials:  API keys do not expire; returns the existing credentials unchanged.
 */

export function buildAuthUrl(_state: string): string {
  return NARVAR_DASHBOARD_URL
}

export async function exchangeApiKey(apiKey: string): Promise<Credentials> {
  return { accessToken: apiKey }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
