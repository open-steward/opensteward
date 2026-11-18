/**
 * Trendyol Partner API auth helpers.
 *
 * Trendyol does NOT use OAuth2 authorization-code flow. Sellers create API
 * key + API secret pairs in the seller panel under
 * "Account Details → Integration Details" (Entegrasyon Bilgileri).
 *
 * The adapter uses HTTP Basic authentication:
 *   Authorization: Basic base64("{apiKey}:{apiSecret}")
 *
 * A mandatory User-Agent header must also be sent on every request:
 *   User-Agent: "{supplierId} - SelfIntegration"
 *
 * The supplierId is embedded as a path segment in resource endpoints:
 *   /integration/product/sellers/{supplierId}/products
 *
 * Credentials are passed to the adapter via
 * `POST /v1/connections` with:
 *   { platform: 'trendyol', credentials: { apiKey, apiSecret, supplierId } }
 *
 * Docs: https://developers.trendyol.com/docs/authorization
 */

import type { Credentials } from '@opensteward/shared'

export function buildAuthHeader(apiKey: string, apiSecret: string): string {
  const encoded = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')
  return `Basic ${encoded}`
}

export function buildUserAgent(supplierId: string): string {
  return `${supplierId} - SelfIntegration`
}

export function exchangeCode(): Promise<Credentials> {
  throw new Error(
    'Trendyol does not use OAuth code exchange. ' +
      'Create API credentials in the seller panel under ' +
      'Account Details → Integration Details, ' +
      'then POST them to /v1/connections with body ' +
      '`{platform: "trendyol", credentials: {apiKey, apiSecret, supplierId}}`.',
  )
}
