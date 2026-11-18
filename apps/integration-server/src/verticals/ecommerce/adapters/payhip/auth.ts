/**
 * Payhip auth helpers.
 *
 * Payhip does NOT use OAuth2. Authentication is via a static API key that the
 * seller generates once in Settings → Developer. The key is sent on every
 * request as the `payhip-api-key` header.
 *
 * The adapter uses the `simpleApiKey` credential-form template so the Connect
 * Link flow renders a single password input and stores the key as
 * `credentials.accessToken`.
 *
 * Docs: https://payhip.com/api-reference
 */

import { simpleApiKey } from '@opensteward/shared'

export const PAYHIP_API_KEY_FORM = simpleApiKey({
  fieldName: 'apiKey',
  label: 'Payhip API key',
  placeholder: 'Your Payhip API key',
  helpText: 'Find your API key in Payhip Settings → Developer.',
})
