import type { Credentials } from '../../adapter/interface'
import { SHIPPYPRO_DASHBOARD_URL } from './constants'

/**
 * ShippyPro uses API key authentication — not OAuth2.
 *
 * getAuthUrl:          Returns the ShippyPro API keys page (no redirect flow).
 * exchangeCode:        Treats the "code" parameter as the API key and stores it
 *                      directly as the access token.
 * refreshCredentials:  API keys never expire; returns the existing credentials.
 *
 * Wire format, https://api.shippypro.com/docs/v1.json ("Authentication"):
 *   "Every API request must be authenticated with a **Bearer token** — your
 *    **API Key**, sent in the `Authorization` header."
 *   "`Authorization: Bearer your-API-Key`"
 */

export function buildAuthUrl(_state: string): string {
  return SHIPPYPRO_DASHBOARD_URL
}

export async function exchangeApiKey(apiKey: string): Promise<Credentials> {
  return { accessToken: apiKey }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}

/** The Authorization header value for ShippyPro requests: the API key as a Bearer token. */
export function authHeader(apiKey: string): string {
  return `Bearer ${apiKey}`
}
