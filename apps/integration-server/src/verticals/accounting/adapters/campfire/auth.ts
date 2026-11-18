/**
 * Campfire uses static API key authentication.
 * Header: `Authorization: Token <api_key>`
 *
 * Docs: https://docs.campfire.ai/quickstart
 */

import type { Credentials } from '../../adapter/interface'

/**
 * Build a Credentials object from a raw Campfire API key.
 * Campfire does not support OAuth – the key is passed directly as accessToken.
 */
export function credentialsFromApiKey(apiKey: string): Credentials {
  return { accessToken: apiKey }
}
