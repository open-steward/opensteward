import type { Credentials } from '../../adapter/interface'
import { STARSHIPIT_SETTINGS_URL } from './constants'

/**
 * Starshipit uses dual-key authentication:
 *   - StarShipIT-Api-Key (account API token)
 *   - Ocp-Apim-Subscription-Key (developer subscription key)
 *
 * There is no OAuth2 flow. Keys are retrieved from the Starshipit dashboard.
 * We store the API key as `accessToken` and the subscription key as `refreshToken`
 * (repurposed field) since Credentials only has these two string slots.
 */

export function buildAuthUrl(_state: string): string {
  return STARSHIPIT_SETTINGS_URL
}

export async function exchangeApiKey(apiKey: string): Promise<Credentials> {
  // The API key IS the credential — no exchange needed.
  return { accessToken: apiKey }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // Starshipit API keys do not expire.
  return credentials
}

/**
 * Build the Starshipit auth headers for an HTTP request.
 * `accessToken` holds the StarShipIT-Api-Key.
 * `refreshToken` (if present) holds the Ocp-Apim-Subscription-Key.
 */
export function authHeaders(credentials: Credentials): Record<string, string> {
  const headers: Record<string, string> = {
    'StarShipIT-Api-Key': credentials.accessToken,
  }
  if (credentials.refreshToken) {
    headers['Ocp-Apim-Subscription-Key'] = credentials.refreshToken
  }
  return headers
}
