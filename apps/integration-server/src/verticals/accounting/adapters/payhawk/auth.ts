/**
 * Payhawk auth — API key only (no OAuth flow).
 *
 * Payhawk uses a static API key issued from Settings > Integrations > API Keys.
 * The key is sent as X-Payhawk-ApiKey on every request.
 * There is no OAuth authorize / token exchange for server-to-server integrations.
 */
import type { Credentials } from '../../adapter/interface'

/**
 * Validates that credentials contain a non-empty accessToken (the API key).
 * Payhawk API keys do not expire, so refreshCredentials is a no-op passthrough.
 */
export function validateApiKey(credentials: Credentials): void {
  if (!credentials.accessToken) {
    throw new Error('Payhawk: accessToken (API key) is required')
  }
}

/**
 * Payhawk API keys do not expire and cannot be refreshed programmatically.
 * Return the credentials unchanged.
 */
export function passthroughRefresh(credentials: Credentials): Promise<Credentials> {
  return Promise.resolve(credentials)
}
