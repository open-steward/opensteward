/**
 * Documenso auth.
 *
 * Documenso does not implement an OAuth authorization-code flow for its public
 * API — integrators mint a long-lived API token from the dashboard and pass it
 * verbatim in the `Authorization` header. The Connect Link flow therefore uses
 * `credentialFields()` + `exchangeCredentials()` (wired in index.ts via the
 * shared `simpleApiKey` template); the OAuth methods below are inert stubs that
 * satisfy the BaseAdapter contract.
 *
 * Docs: https://docs.documenso.com/developers/public-api/authentication
 */

import type { Credentials } from '@opensteward/shared'
import { API_KEY_SETTINGS_URL } from './constants'

/** Documenso has no OAuth authorize endpoint; point the user at token settings. */
export function buildAuthUrl(
  _clientId: string,
  _redirectUri: string,
  _scopes: string[],
  state: string,
): string {
  return `${API_KEY_SETTINGS_URL}?state=${encodeURIComponent(state)}`
}

/** No authorization-code exchange; the submitted `code` is treated as the API token. */
export function exchangeCode(code: string): Credentials {
  return { accessToken: code.trim() }
}

/** API tokens are long-lived and do not refresh. */
export function refreshCredentials(credentials: Credentials): Credentials {
  return credentials
}
