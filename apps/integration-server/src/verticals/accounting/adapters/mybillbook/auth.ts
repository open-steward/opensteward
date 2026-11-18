/**
 * myBillBook authentication.
 *
 * Auth model: API key (static token). The user generates an API key in
 *   Settings > Integrations > API Keys
 * and passes it as the `X-API-KEY` request header.
 *
 * There is no OAuth flow — credentials hold only the static `accessToken`
 * (= the API key). `refreshCredentials` is a no-op that returns the existing
 * credentials unchanged because API keys do not expire.
 */

import type { Credentials } from '../../adapter/interface'

/**
 * No-op refresh — API keys do not expire.
 * Returns the credentials object unchanged.
 */
export function refreshCredentials(credentials: Credentials): Credentials {
  return credentials
}
