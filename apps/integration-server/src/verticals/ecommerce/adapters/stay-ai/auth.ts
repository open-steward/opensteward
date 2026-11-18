/**
 * Stay AI authentication helpers.
 *
 * Stay AI uses static API keys issued via the merchant portal
 * (Settings → API Keys). There is no OAuth2 authorize/token flow — API keys
 * are created manually and passed to the adapter through the credentials
 * store as `accessToken`.
 *
 * `getAuthUrl` returns an informational link to the merchant portal settings
 * page. `exchangeCode` throws a clear error so callers fail loudly instead of
 * silently pretending to support the flow.
 *
 * Docs: https://docs.stay.ai/reference/authentication
 */

import type { Credentials } from '@opensteward/shared'

/** URL of the Stay AI merchant portal API keys settings page. */
const MERCHANT_PORTAL_API_KEYS_URL =
  'https://app.retextion.com/settings/api-keys'

export function buildAuthUrl(): string {
  return MERCHANT_PORTAL_API_KEYS_URL
}

export function exchangeCode(): Promise<Credentials> {
  throw new Error(
    'Stay AI does not use OAuth code exchange. ' +
      'Generate an API key in the Stay AI merchant portal under Settings → API Keys, ' +
      'then POST it to /v1/connections with body ' +
      '`{ platform: "stay-ai", credentials: { accessToken: "<your-api-key>" } }`.',
  )
}
