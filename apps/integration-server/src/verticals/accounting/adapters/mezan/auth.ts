/**
 * Mezan auth — API-key (Bearer token) model.
 *
 * Mezan issues API keys from within the app (Advanced plan).  There is no
 * OAuth redirect flow.  The key is stored directly as `credentials.accessToken`
 * and sent as `Authorization: Bearer <key>` on every request.
 */
import type { Credentials } from '../../adapter/interface'

/** Not used for API-key auth — returns a no-op sentinel. */
export function getAuthUrl(_state: string): string {
  return '#'
}

/**
 * `code` carries the raw API key supplied through the Connect Link form.
 * We store it directly as `accessToken`; no exchange call is needed.
 */
export async function exchangeCode(code: string): Promise<Credentials> {
  const key = code.trim()
  if (!key) throw new Error('Mezan API key must not be empty.')
  return { accessToken: key }
}

/** API keys do not expire; return the credentials unchanged. */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
