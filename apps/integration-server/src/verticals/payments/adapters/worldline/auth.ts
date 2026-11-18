/**
 * Worldline Direct uses an API key / API secret pair plus the merchant's
 * PSPID. Requests are signed with HMAC-SHA256 (see `client.ts`); the secret
 * never leaves the server. We stash all three values on the credential so the
 * signer can rebuild the `GCS v1HMAC` Authorization header on every call.
 *
 * Each API key/secret pair expires one year after creation and is rotated via
 * the Worldline Merchant Portal.
 *
 * Docs: https://docs.direct.worldline-solutions.com/en/integration/api-developer-guide/authentication
 */
import type { Credentials } from '@opensteward/shared'

export interface WorldlineExtra extends Record<string, unknown> {
  apiSecret: string
  merchantId: string
  environment: 'sandbox' | 'production'
}

export function buildCredentials(fields: Record<string, string>): Credentials {
  const apiKeyId = (fields.apiKeyId ?? '').trim()
  const apiSecret = (fields.apiSecret ?? '').trim()
  const merchantId = (fields.merchantId ?? '').trim()
  const environment = fields.environment === 'production' ? 'production' : 'sandbox'

  if (!apiKeyId) throw new Error('Worldline API key ID is required.')
  if (!apiSecret) throw new Error('Worldline API secret is required.')
  if (!merchantId) throw new Error('Worldline PSPID (merchant ID) is required.')

  const extra: WorldlineExtra = { apiSecret, merchantId, environment }
  // `accessToken` carries the API key id (the public half of the pair).
  return { accessToken: apiKeyId, extra }
}

export function readExtra(credentials: Credentials): WorldlineExtra {
  const extra = (credentials.extra ?? {}) as Partial<WorldlineExtra>
  return {
    apiSecret: String(extra.apiSecret ?? ''),
    merchantId: String(extra.merchantId ?? ''),
    environment: extra.environment === 'production' ? 'production' : 'sandbox',
  }
}
