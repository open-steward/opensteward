/**
 * Invoice Ninja v5 authentication.
 *
 * Auth model: API key (static token). The user generates a token in
 *   Settings > Account Management > Integrations > API Tokens
 * and passes it as the `X-API-TOKEN` request header.
 *
 * There is no OAuth flow for the public API — credentials hold only the
 * static `accessToken` (= the API token).  `refreshCredentials` is a
 * no-op that returns the existing credentials unchanged.
 */

import type { Credentials } from '../../adapter/interface'

/**
 * Validates that credentials contain a non-empty API token.
 * Throws if the token is absent so callers get a clear error message.
 */
export function validateCredentials(credentials: Credentials): void {
  if (!credentials.accessToken) {
    throw new Error('Invoice Ninja: accessToken (API token) is required')
  }
}

/**
 * No-op refresh — API tokens do not expire.
 * Returns the credentials object unchanged.
 */
export function refreshCredentials(credentials: Credentials): Credentials {
  return credentials
}
