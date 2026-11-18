/**
 * Zefort auth.
 *
 * Zefort has no OAuth flow. Integrators mint a long-lived API key from
 * Account settings → API keys; the key is tied to a single user on the
 * account. The key is passed as the username of an HTTP Basic header with an
 * empty password (assembled in client.ts).
 *
 * Because a Zefort instance is addressed by its own hostname (the sandbox,
 * the EU/US shared regions, or a dedicated host), the Connect Link form also
 * collects the instance base URL; both the key and the resolved base URL are
 * persisted on the returned credentials so the client can rebuild the Basic
 * header and target the right host without re-prompting.
 *
 * The Connect Link flow therefore uses `credentialFields()` +
 * `exchangeCredentials()` (wired in index.ts via the shared `customForm`
 * template). The OAuth methods below are inert stubs that satisfy the
 * BaseAdapter contract.
 *
 * Docs: https://developers.zefort.com/docs/introduction/
 */

import type { Credentials } from '@opensteward/shared'
import { API_KEY_SETTINGS_URL, DEFAULT_API_BASE_URL } from './constants'

/** Normalize a customer-supplied host into a `https://host/api` base URL. */
export function normalizeBaseUrl(input: string | undefined): string {
  const raw = (input ?? '').trim()
  if (!raw) return DEFAULT_API_BASE_URL
  // Accept bare hosts ("my.zefort.com"), full UI URLs, or full API URLs.
  let url = raw
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`
  url = url.replace(/\/+$/, '')
  if (!/\/api$/i.test(url)) url = `${url}/api`
  return url
}

/** Zefort has no OAuth authorize endpoint; point the user at the API-key page. */
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
  return { accessToken: code.trim(), extra: { baseUrl: DEFAULT_API_BASE_URL } }
}

/** API keys are long-lived and do not refresh. */
export function refreshCredentials(credentials: Credentials): Credentials {
  return credentials
}
