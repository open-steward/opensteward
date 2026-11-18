/**
 * ManoMano API-key auth helpers.
 *
 * ManoMano does NOT use OAuth2's authorisation-code flow. Sellers generate
 * an API key in the ManoMano Toolbox (Settings → API keys) and pass it in
 * the `x-api-key` header on every request.
 *
 * The adapter therefore:
 *  - Exposes `credentialFields` / `exchangeCredentials` via the simpleApiKey
 *    template so the Connect Link flow renders a single password input.
 *  - Returns a no-op from `getAuthUrl` (ManoMano has no OAuth redirect URL).
 *  - Throws from `exchangeCode` with clear instructions.
 *
 * Docs: https://www.manomano.dev/
 */

import type { Credentials } from '@opensteward/shared'

export function getAuthUrl(): string {
  // ManoMano has no OAuth authorize URL — point integrators at the Toolbox.
  return 'https://toolbox.manomano.com/settings/api-keys'
}

export function exchangeCode(): Promise<Credentials> {
  throw new Error(
    'ManoMano does not use OAuth code exchange. ' +
      'Generate an API key in the ManoMano Toolbox (Settings → API keys), ' +
      'then POST it to /v1/connections with body ' +
      '`{platform: "manomano", credentials: {apiKey: "<your-key>"}}`.',
  )
}
