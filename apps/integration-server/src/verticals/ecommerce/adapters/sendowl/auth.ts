/**
 * SendOwl "auth" helpers.
 *
 * SendOwl has no OAuth authorization-code flow. Merchants generate a static
 * API key + secret pair under Settings → Advanced settings → Developer →
 * SendOwl API, and every request authenticates with HTTP Basic auth using
 * that pair (see `../sendowl/client.ts`). The adapter therefore:
 *
 *  - Points `getAuthUrl` at the in-dashboard API keys page (informational
 *    only — not a functional OAuth authorize URL).
 *  - Throws from `exchangeCode` so a caller that mistakenly tries the OAuth
 *    flow fails loudly instead of silently doing nothing.
 *
 * Docs: https://dashboard.sendowl.com/developers/api/introduction
 */
import type { Credentials } from '@opensteward/shared'

export function buildAuthUrl(): string {
  return 'https://dashboard.sendowl.com/settings/advanced_settings'
}

export function exchangeCode(): Promise<Credentials> {
  throw new Error(
    'SendOwl does not use OAuth code exchange. Generate an API key + secret in ' +
      'Settings → Advanced settings → Developer → SendOwl API, then POST them to ' +
      '/v1/connections with body `{platform: "sendowl", credentials: {apiKey, apiSecret}}`.',
  )
}
