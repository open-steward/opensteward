/**
 * Recharge auth helpers.
 *
 * Recharge does NOT use OAuth2's authorization-code flow for store integrations.
 * Authentication is via a plain API token placed in the `X-Recharge-Access-Token`
 * request header. Merchants generate tokens in the Recharge merchant portal
 * under Tools & Apps → API tokens.
 *
 * `buildAuthUrl` returns an informational link to the Recharge API-token page.
 * `exchangeCode` throws with a descriptive error so callers fail loudly
 * instead of silently attempting an unsupported OAuth flow.
 *
 * Docs: https://developer.rechargepayments.com/2021-11
 */

import type { Credentials } from '@opensteward/shared'

export function buildAuthUrl(): string {
  // Informational only — NOT a functional OAuth authorize URL.
  return 'https://app.rechargeapps.com/merchant/api/tokens'
}

export function exchangeCode(): Promise<Credentials> {
  throw new Error(
    'Recharge does not use OAuth code exchange. ' +
      'Generate an API token in the Recharge merchant portal under ' +
      'Tools & Apps → API tokens, then POST it to /v1/connections with ' +
      '`{ platform: "recharge", credentials: { accessToken: "<your-api-token>" } }`.',
  )
}
