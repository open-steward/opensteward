/**
 * Signable auth.
 *
 * Signable has no OAuth flow. Integrators mint a long-lived API key from
 * Company Settings → API & Webhooks and pass it as the username of an HTTP
 * Basic header (with a literal `x` as the password). The Connect Link flow
 * therefore uses `credentialFields()` + `exchangeCredentials()` (wired in
 * index.ts via the shared `simpleApiKey` template); the OAuth methods below
 * are inert stubs that satisfy the BaseAdapter contract.
 *
 * Docs: https://developers.signable.app/authentication
 */

import type { Credentials } from '@opensteward/shared'
import { API_KEY_SETTINGS_URL } from './constants'

/** Signable has no OAuth authorize endpoint; point the user at Company Settings → API & Webhooks. */
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
