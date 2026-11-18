/**
 * Crater auth helpers.
 *
 * Crater is self-hosted and uses Bearer tokens (personal-access grant).
 * There is no OAuth redirect flow; credentials are collected via the
 * Connect Link form (credentialFields / exchangeCredentials on the adapter).
 *
 * `buildAuthUrl` and `exchangeCode` are no-ops that satisfy the BaseAdapter
 * interface without performing any network calls.
 */
import type { Credentials } from '../../adapter/interface'

/**
 * Returns the Crater settings page for the configured instance.
 * Used as a fallback "auth URL" for the Connect Link UI.
 */
export function buildAuthUrl(baseUrl: string): string {
  const origin = baseUrl.replace(/\/+$/, '')
  return `${origin}/settings/integrations`
}

/** No-op: Crater does not issue codes via redirect. */
export async function exchangeCode(_code: string): Promise<Credentials> {
  return { accessToken: _code }
}

/** Crater personal-access tokens do not expire; return credentials unchanged. */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
