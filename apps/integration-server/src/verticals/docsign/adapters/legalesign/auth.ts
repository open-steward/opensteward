/**
 * Legalesign auth.
 *
 * Legalesign has no OAuth flow. Integrators mint a long-lived API key from
 * the API Dashboard (https://logs.legalesign.com) and present it on every
 * request as `Authorization: ApiKey <username>:<secret>`. The username and
 * secret are shown together in the dashboard; the customer pastes the joined
 * `username:secret` string into the Connect Link form. They also pick the
 * region their account is hosted in (US or EU) so the client can target the
 * correct base URL.
 *
 * The Connect Link flow therefore uses `credentialFields()` +
 * `exchangeCredentials()` (wired in index.ts via the shared `customForm`
 * template); the OAuth methods below are inert stubs that satisfy the
 * BaseAdapter contract.
 *
 * Docs: https://apidocs.legalesign.com/docs/intro/
 */

import type { Credentials } from '@opensteward/shared'
import { API_KEY_DASHBOARD_URL } from './constants'

/** Legalesign has no OAuth authorize endpoint; point the user at the dashboard. */
export function buildAuthUrl(
  _clientId: string,
  _redirectUri: string,
  _scopes: string[],
  state: string,
): string {
  return `${API_KEY_DASHBOARD_URL}?state=${encodeURIComponent(state)}`
}

/** No authorization-code exchange; the submitted `code` is treated as the API key. */
export function exchangeCode(code: string): Credentials {
  return { accessToken: code.trim() }
}

/** API keys are long-lived and do not refresh. */
export function refreshCredentials(credentials: Credentials): Credentials {
  return credentials
}
