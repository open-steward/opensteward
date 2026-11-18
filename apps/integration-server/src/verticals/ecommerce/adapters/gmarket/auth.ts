/**
 * Gmarket auth helpers — API key authentication.
 *
 * Gmarket uses a proprietary API key model. Sellers generate an API key
 * and secret from the Gmarket Seller Office. There is no OAuth2 flow.
 *
 * Credentials layout:
 *   - `accessToken`        Gmarket API key
 *   - `extra.apiSecret`    Gmarket API secret (for HMAC signing if required)
 *   - `extra.sellerId`     Gmarket seller ID
 */

import type { Credentials } from '@opensteward/shared'

/**
 * Build a placeholder auth URL — Gmarket does not use OAuth2.
 * Sellers obtain credentials from the Gmarket Seller Office portal.
 */
export function buildAuthUrl(_state: string): string {
  return 'https://seller.gmarket.co.kr/api-settings'
}

/**
 * Exchange is not applicable for API-key auth. Returns credentials
 * directly from the provided code (treated as the API key).
 */
export async function exchangeCode(
  code: string,
  _redirectUri: string,
): Promise<Credentials> {
  return {
    accessToken: code,
    extra: {},
  }
}

/**
 * Gmarket API keys do not expire, so refresh is a no-op that returns
 * the same credentials.
 */
export async function refreshCredentials(
  credentials: Credentials,
): Promise<Credentials> {
  return credentials
}
