/**
 * Rakuten RMS auth helpers.
 *
 * Rakuten's RMS (Rakuten Merchant Server) API uses a simple static key pair
 * for authentication — there are no expiring tokens and no OAuth dance.
 *
 * Credentials layout:
 *
 *   - `accessToken`            = applicationId (used for public Ichiba API)
 *   - `extra.licenseKey`       = RMS license key
 *   - `extra.serviceSecret`    = RMS service secret
 *   - `extra.affiliateId`      = (optional) Rakuten affiliate ID
 *
 * The RMS Authorization header is built as:
 *   `ESA ${base64(serviceSecret + ":" + licenseKey)}`
 *
 * Since credentials are static, `refreshCredentials` is a no-op that simply
 * returns the credentials unchanged.
 */

import type { Credentials } from '@opensteward/shared'

/**
 * Build the RMS ESA Authorization header value from credentials.
 *
 * Throws if licenseKey or serviceSecret are not present in extra.
 */
export function buildEsaHeader(credentials: Credentials): string {
  const licenseKey = credentials.extra?.['licenseKey'] as string | undefined
  const serviceSecret = credentials.extra?.['serviceSecret'] as string | undefined

  if (!licenseKey || !serviceSecret) {
    throw new Error(
      'Rakuten RMS requires licenseKey and serviceSecret in credentials.extra. ' +
        'Set them when creating the connection.',
    )
  }

  const encoded = Buffer.from(`${serviceSecret}:${licenseKey}`).toString('base64')
  return `ESA ${encoded}`
}

/**
 * Rakuten uses static keys — no refresh needed. Returns credentials unchanged.
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}

/**
 * Validate that credentials contain the required RMS fields.
 */
export function validateCredentials(credentials: Credentials): void {
  const licenseKey = credentials.extra?.['licenseKey'] as string | undefined
  const serviceSecret = credentials.extra?.['serviceSecret'] as string | undefined

  if (!licenseKey || !serviceSecret) {
    throw new Error(
      'Rakuten adapter: credentials.extra must include licenseKey and serviceSecret.',
    )
  }
}
