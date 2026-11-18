/**
 * Dext Precision auth helpers.
 *
 * Dext Precision uses static API tokens (Bearer) generated in the practice
 * settings UI. There is no OAuth2 authorization-code or token-refresh flow.
 * The helpers below satisfy the BaseAdapter interface while routing users to
 * the settings page where they can copy their token.
 */

import type { Credentials } from '../../adapter/interface'
import { DEXT_CONNECT_PAGE } from './constants'

/**
 * Returns the Dext settings URL where the user can generate an API token.
 * No OAuth redirect is involved.
 */
export function buildAuthUrl(_state: string): string {
  return DEXT_CONNECT_PAGE
}

/**
 * Treats the "code" as the raw API token entered by the user in the Connect
 * Link form.
 */
export async function exchangeCode(code: string): Promise<Credentials> {
  return { accessToken: code.trim() }
}

/**
 * Static tokens do not expire; return credentials unchanged.
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
