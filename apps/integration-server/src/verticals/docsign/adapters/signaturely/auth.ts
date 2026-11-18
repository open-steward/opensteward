/**
 * Signaturely auth.
 *
 * Signaturely has no OAuth flow. Integrators mint a long-lived API key from
 * their account API settings and send it on every request in the
 * `Authorization: Api-Key <key>` header. The Connect Link flow therefore uses
 * `credentialFields()` + `exchangeCredentials()` (wired in index.ts via the
 * shared `simpleApiKey` template); the OAuth methods below are inert stubs
 * that satisfy the BaseAdapter contract.
 *
 * Docs: https://docs.signaturely.com/
 */

import type { Credentials } from '@opensteward/shared'
import { API_KEY_SETTINGS_URL } from './constants'

/** Signaturely has no OAuth authorize endpoint; point the user at the API-key page. */
export function buildAuthUrl(
  _clientId: string,
  _redirectUri: string,
  _scopes: string[],
  state: string,
): string {
  return `${API_KEY_SETTINGS_URL}?state=${encodeURIComponent(state)}`
}

/** No authorization-code exchange; the submitted `code` is treated as the API key. */
export function exchangeCode(code: string): Credentials {
  return { accessToken: code.trim() }
}

/** API keys are long-lived and do not refresh. */
export function refreshCredentials(credentials: Credentials): Credentials {
  return credentials
}
