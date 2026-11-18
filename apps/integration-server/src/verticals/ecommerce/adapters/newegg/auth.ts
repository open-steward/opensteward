/**
 * Newegg Marketplace auth helpers — API key authentication.
 *
 * Newegg uses seller ID + secret key (API authorization) rather than
 * OAuth2. Sellers generate API keys in the Newegg Seller Portal.
 *
 * Credentials layout:
 *   - `accessToken`          Newegg secret key (API authorization)
 *   - `extra.sellerId`       Newegg seller ID
 *
 * Since there is no token expiry / refresh cycle, refreshCredentials
 * simply returns the same credentials unchanged.
 */

import type { Credentials } from '@opensteward/shared'

/**
 * Build credentials from seller ID and secret key.
 */
export function buildCredentials(sellerId: string, secretKey: string): Credentials {
  return {
    accessToken: secretKey,
    extra: { sellerId },
  }
}

/**
 * Extract the seller ID from credentials.
 */
export function getSellerId(credentials: Credentials): string {
  const sellerId = credentials.extra?.['sellerId'] as string | undefined
  if (!sellerId) {
    throw new Error(
      'Newegg adapter requires sellerId in credentials.extra — ' +
        'ensure the connection was created with a valid Newegg seller ID.',
    )
  }
  return sellerId
}

/**
 * Refresh Newegg credentials. Since Newegg uses API keys (no token
 * expiry), we simply return the existing credentials unchanged.
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
