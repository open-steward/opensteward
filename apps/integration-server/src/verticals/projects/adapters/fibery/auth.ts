/**
 * Fibery authentication — static API token (api_key model).
 *
 * Fibery issues long-lived personal API tokens via the workspace Settings →
 * API Tokens page. The token is sent as:
 *
 *   Authorization: Token <token>
 *
 * There is no OAuth2 flow for first-party API access; credentials are
 * collected through the Connect Link form (simpleApiKey template).
 * The token is stored in `credentials.accessToken`.
 *
 * Docs: https://developers.fibery.com/guides/getting-started/authentication
 */
import type { Credentials } from '@opensteward/shared'
import { TOKEN_HELP_URL } from './constants'

/**
 * No redirect URL — point users at the Fibery token documentation.
 * The Connect Link uses the `simpleApiKey` template which shows an
 * API-key input field rather than an OAuth redirect.
 */
export function buildAuthUrl(_state: string): string {
  return TOKEN_HELP_URL
}

/**
 * The Connect Link flow passes the raw API token as the "code".
 * Store it in `accessToken` with no expiry.
 */
export async function exchangeCode(code: string): Promise<Credentials> {
  return { accessToken: (code ?? '').trim() }
}

/**
 * Fibery API tokens are long-lived and do not expire — return as-is.
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
