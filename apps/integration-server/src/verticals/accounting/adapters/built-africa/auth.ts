/**
 * Built Accounting auth — API key (Bearer token).
 *
 * The user generates a business-scoped access token from the Built developer
 * console. Each token is shown only once and is scoped to a single business.
 * We store it as `credentials.accessToken` and send it as:
 *   Authorization: Bearer <token>
 *
 * There is no OAuth flow: `getAuthUrl` / `exchangeCode` / `refreshCredentials`
 * are stubs that satisfy the BaseAdapter interface. The adapter opts into the
 * Connect Link form via `simpleApiKey()` in index.ts.
 */
import type { Credentials } from '../../adapter/interface'

export function buildAuthUrl(_state: string): string {
  // Not used — api_key adapters use the Connect Link form, not an OAuth redirect.
  return ''
}

export async function exchangeCode(_code: string): Promise<Credentials> {
  throw new Error('Built Accounting uses API-key authentication, not OAuth code exchange.')
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // API keys do not expire — return as-is.
  return credentials
}
