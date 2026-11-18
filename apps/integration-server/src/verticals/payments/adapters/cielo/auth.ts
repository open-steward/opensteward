/**
 * Cielo eCommerce API 3.0 uses *dual-header* authentication: every request
 * carries a `MerchantId` (store GUID) and a `MerchantKey` (40-char secret).
 * There is no OAuth flow and no Bearer token.
 *
 * We map this onto `Credentials` as:
 *   - accessToken        → MerchantId
 *   - extra.merchantKey  → MerchantKey
 *   - extra.environment  → 'sandbox' | 'production' (selects the base URLs)
 *   - extra.webhookHeaderName / extra.webhookHeaderValue → optional static
 *     header pair Cielo echoes on notification POSTs (its only "signature").
 *
 * Docs: https://developercielo.github.io/manual/cielo-ecommerce
 */
import type { Credentials } from '@opensteward/shared'

export type CieloEnvironment = 'sandbox' | 'production'

export function buildCredentials(fields: Record<string, string>): Credentials {
  const merchantId = (fields.merchantId ?? '').trim()
  const merchantKey = (fields.merchantKey ?? '').trim()
  if (!merchantId) throw new Error('Cielo MerchantId is required.')
  if (!merchantKey) throw new Error('Cielo MerchantKey is required.')
  const environment: CieloEnvironment =
    fields.environment === 'production' ? 'production' : 'sandbox'
  const extra: Record<string, unknown> = { merchantKey, environment }
  if (fields.webhookHeaderName) extra.webhookHeaderName = fields.webhookHeaderName.trim()
  if (fields.webhookHeaderValue) extra.webhookHeaderValue = fields.webhookHeaderValue
  return { accessToken: merchantId, extra }
}

export function merchantIdFrom(credentials: Credentials): string {
  return credentials.accessToken
}

export function merchantKeyFrom(credentials: Credentials): string {
  return String((credentials.extra as Record<string, unknown> | undefined)?.merchantKey ?? '')
}

export function environmentFrom(credentials: Credentials): CieloEnvironment {
  const env = (credentials.extra as Record<string, unknown> | undefined)?.environment
  return env === 'production' ? 'production' : 'sandbox'
}
