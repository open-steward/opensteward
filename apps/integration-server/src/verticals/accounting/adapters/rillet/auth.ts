/**
 * Rillet auth helpers.
 *
 * Rillet uses API-key (Bearer token) authentication — there is no OAuth2
 * authorization-code flow. The API key is long-lived and managed by the user
 * in their Rillet organization settings.
 *
 * Docs: https://docs.api.rillet.com/docs/getting-started
 */

import type { Credentials } from '../../adapter/interface'

/**
 * Build a static Credentials object from a Rillet API key.
 * The key is stored in `accessToken`; there is no refresh flow.
 */
export function credentialsFromApiKey(apiKey: string): Credentials {
  return {
    accessToken: apiKey,
  }
}

/**
 * No-op: Rillet API keys do not expire and have no refresh mechanism.
 * Return the same credentials unchanged.
 */
export function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return Promise.resolve(credentials)
}
