/**
 * Bind ERP authentication – API key model.
 *
 * The caller supplies a long-lived API key (JWT-like string beginning with
 * "eyJh...") retrieved from Settings → Profile → Integrations inside the
 * Bind ERP admin panel.  The key is forwarded as-is in the `apiKey` HTTP
 * request header (no "Bearer " prefix).
 *
 * There is no OAuth flow, no token exchange, and no refresh cycle.
 * `Credentials.accessToken` carries the raw API key.
 */

import type { Credentials } from '../../adapter/interface'

/**
 * Wraps a raw Bind ERP API key in the canonical `Credentials` envelope so
 * the rest of the adapter pipeline can treat it uniformly.
 */
export function credentialsFromApiKey(apiKey: string): Credentials {
  return { accessToken: apiKey }
}

// No OAuth flow — users retrieve their API key from Settings → Profile → Integrations.
export function buildAuthUrl(_state: string): string {
  return 'https://app.bind.com.mx/settings/integrations'
}

export async function exchangeCode(code: string): Promise<Credentials> {
  return { accessToken: code }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
