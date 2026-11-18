import type { Credentials } from '../../adapter/interface'
import { PACKETA_DASHBOARD_URL } from './constants'

/**
 * Packeta uses API-password authentication — not OAuth2.
 *
 * getAuthUrl:           Returns the Packeta dashboard API-key page (no redirect flow).
 * exchangeApiPassword:  Treats the supplied string as the API password and stores it
 *                       directly as the access token.
 * refreshCredentials:   API passwords do not expire; returns existing credentials.
 *
 * The API password is submitted as `<apiPassword>` in every SOAP/REST request body.
 * The first 16 characters of the password double as the public API key used in
 * data-feed URLs (branch list, widget).
 */

export function buildAuthUrl(_state: string): string {
  // Packeta has no OAuth2 flow — direct users to their credentials page.
  return PACKETA_DASHBOARD_URL
}

export async function exchangeApiPassword(apiPassword: string): Promise<Credentials> {
  // The API password IS the credential — no exchange needed.
  return {
    accessToken: apiPassword,
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // Packeta API passwords do not expire.
  return credentials
}

/**
 * Return the public API key (first 16 chars of the API password).
 * Used in data-feed URLs such as the branch list.
 */
export function apiKeyFromPassword(apiPassword: string): string {
  return apiPassword.slice(0, 16)
}
