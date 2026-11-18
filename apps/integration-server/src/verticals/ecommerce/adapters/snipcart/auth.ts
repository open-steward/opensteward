/**
 * Snipcart auth helpers.
 *
 * Snipcart does NOT use OAuth2. Authentication is via a secret API key
 * generated in the Snipcart dashboard (Account → API keys). The key is sent
 * on every request as an HTTP Basic auth credential where the key is the
 * username and the password is an empty string:
 *
 *   Authorization: Basic base64("{API_KEY}:")
 *
 * The adapter uses the `simpleApiKey` credential-form template so the Connect
 * Link flow renders a single password input and stores the key as
 * `credentials.accessToken`.
 *
 * Docs: https://docs.snipcart.com/v3/api-reference/authentication
 */

import { simpleApiKey } from '@opensteward/shared'

export const SNIPCART_API_KEY_FORM = simpleApiKey({
  fieldName: 'apiKey',
  label: 'Snipcart Secret API key',
  placeholder: 'Your Snipcart secret API key',
  helpText: 'Find your secret API key in the Snipcart dashboard under Account → API keys.',
})

/**
 * Build the Basic auth header value for the given API key.
 * Snipcart uses HTTP Basic with the key as the username and an empty password.
 */
export function buildBasicAuthHeader(apiKey: string): string {
  const encoded = Buffer.from(`${apiKey}:`).toString('base64')
  return `Basic ${encoded}`
}
