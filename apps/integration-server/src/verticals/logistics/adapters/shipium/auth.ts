import type { Credentials } from '../../adapter/interface'
import { SHIPIUM_DASHBOARD_URL } from './constants'

/**
 * Shipium API-key authentication (Basic Auth, key as the username).
 * https://docs.shipium.com/docs/api-key-based-authentication
 *   "Use the Basic Auth username value when providing your API key."
 *   "To use your API key within an application context, you must provide it as
 *    a Base64-encoded value via the Authorization header. Add a trailing colon
 *    (:) to the end of your key before encoding."
 *
 * `accessToken` holds the raw API key (what Connect Link's `simpleApiKey` form
 * stores); the header is built from it on every request.
 */

export function buildAuthUrl(_state: string): string {
  return SHIPIUM_DASHBOARD_URL
}

/**
 * Store the raw API key. The docs' cURL form is `--user "$API_KEY:"`, so a
 * key pasted with that trailing colon has it removed.
 */
export async function exchangeApiKey(rawCredential: string): Promise<Credentials> {
  return { accessToken: rawCredential.trim().replace(/:$/, '') }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // Shipium API keys do not expire.
  return credentials
}

/** `Basic base64("<apiKey>:")`. */
export function authHeader(apiKey: string): string {
  return `Basic ${Buffer.from(`${apiKey}:`, 'utf8').toString('base64')}`
}
