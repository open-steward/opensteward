/**
 * Directo uses a simple API-key model: each company issues keys from their ERP
 * settings panel.  The key is passed in the `X-Directo-Key` request header.
 * There is no OAuth flow — credentials are managed entirely via `simpleApiKey`.
 */
import type { Credentials } from '../../adapter/interface'

/** Not used by Directo (no OAuth).  Returns a placeholder. */
export function buildAuthUrl(_state: string): string {
  return 'https://login.directo.ee'
}

/** Not used by Directo — the key is entered directly via the credential form. */
export async function exchangeCode(_code: string): Promise<Credentials> {
  return { accessToken: _code }
}

/** API keys do not expire; return credentials unchanged. */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
