/**
 * Skio API-key auth helpers.
 *
 * Skio does NOT use OAuth2's authorization-code flow. Merchants generate
 * an API key from their Skio dashboard (API & Integrations → API) and
 * use it in every request as:
 *
 *   Authorization: API <key>
 *
 * The adapter therefore:
 *  - Points `getAuthUrl` at the Skio dashboard API-key page (informational).
 *  - Throws from `exchangeCode` with clear instructions.
 *
 * Docs: https://help.skio.com/docs/using-the-skio-api
 */

import type { Credentials } from '@opensteward/shared'

/**
 * Returns the Skio dashboard URL where merchants can generate API keys.
 * Not a functional OAuth authorize URL.
 */
export function buildAuthUrl(): string {
  return 'https://app.skio.com/dashboard/settings/integrations/api'
}

/**
 * Skio does not support OAuth code exchange. Throws a descriptive error
 * so callers fail loudly instead of silently using the wrong flow.
 */
export function exchangeCode(): Promise<Credentials> {
  throw new Error(
    'Skio does not use OAuth code exchange. ' +
      'Generate an API key in the Skio dashboard under API & Integrations → API, ' +
      'then POST it to /v1/connections with body ' +
      '`{platform: "skio", credentials: {apiKey: "<your-key>"}}`.',
  )
}
