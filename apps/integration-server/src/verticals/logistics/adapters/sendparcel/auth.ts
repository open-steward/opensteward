import type { Credentials } from '../../adapter/interface'
import { SENDPARCEL_DASHBOARD_URL } from './constants'

/**
 * SendParcel uses an API token, not OAuth2.
 *
 * getAuthUrl:          Returns the SendParcel API description page (no redirect flow).
 * exchangeApiKey:      Treats the provided string as the API token and stores it
 *                      directly as the access token.
 * refreshCredentials:  API tokens never expire; returns the existing credentials.
 */

export function buildAuthUrl(_state: string): string {
  // SendParcel has no OAuth2 flow — direct users to their API documentation page.
  return SENDPARCEL_DASHBOARD_URL
}

export async function exchangeApiKey(apiKey: string): Promise<Credentials> {
  // The API token IS the credential — no exchange needed.
  return {
    accessToken: apiKey,
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // SendParcel API tokens do not expire.
  return credentials
}

/**
 * The auth header for SendParcel `/rest-api/` requests. Every operation in the
 * spec at https://api.sendparcel.com/rest-api/doc declares
 * `"parameters":[{"name":"password","in":"header"}]`; the token goes there, not
 * in an `Authorization: Bearer` header.
 */
export function authHeaders(apiKey: string): Record<string, string> {
  return { password: apiKey }
}
