/**
 * DualEntry uses API key authentication.
 * The API key is passed in the `X-API-KEY` request header.
 *
 * There is no OAuth flow — the adapter stores the API key as the
 * `accessToken` field of the Credentials object and uses the Connect
 * Link credential form (`simpleApiKey()`) to collect it from users.
 */
import type { Credentials } from '../../adapter/interface'

/** Redirect target — DualEntry uses an API key, not OAuth. */
export function buildAuthUrl(_state: string): string {
  return 'https://app.dualentry.com/settings/api'
}

/** For api_key auth, "exchange" is a no-op — treat code as the raw key. */
export async function exchangeCode(code: string): Promise<Credentials> {
  return { accessToken: code }
}

/** API keys do not expire — return credentials unchanged. */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
