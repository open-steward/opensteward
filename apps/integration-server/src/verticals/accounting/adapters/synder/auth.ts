/**
 * Synder Importer API authentication.
 *
 * Synder uses a static Bearer token (API key), not OAuth2.
 * Tokens are generated in the Synder web dashboard under Account → API Keys
 * and displayed only once at creation time.
 *
 * There is no OAuth2 authorization URL, no authorization-code flow, and no
 * token-refresh endpoint. The adapter implements the BaseAdapter auth methods
 * as no-ops / stubs, and uses the simpleApiKey credential template to collect
 * the key via the Connect Link form.
 *
 * Docs: https://importer.synder.com/apidocs
 */

import type { Credentials } from '../../adapter/interface'
import { simpleApiKey } from '@opensteward/shared'

export const SYNDER_CREDENTIAL_FORM = simpleApiKey({
  label: 'API key',
  placeholder: 'Paste your Synder API key here',
  helpText:
    'Generate a key in the Synder dashboard under Account → API Keys. The key is shown only once.',
})

/**
 * Build a Credentials object from a raw Synder API key string.
 * The accessToken field carries the bearer token verbatim.
 */
export function credentialsFromApiKey(apiKey: string): Credentials {
  return { accessToken: apiKey.trim() }
}

/**
 * Synder tokens do not expire and cannot be refreshed programmatically.
 * Return the existing credentials unchanged.
 */
export function passthrough(credentials: Credentials): Credentials {
  return credentials
}
