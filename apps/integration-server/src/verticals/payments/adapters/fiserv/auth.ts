/**
 * Fiserv Commerce Hub authentication.
 *
 * Commerce Hub is an `api_key` adapter: the merchant supplies an API key and a
 * matching API secret (issued together on the Fiserv Developer Portal, per
 * environment). There is no OAuth flow and no Bearer token. Instead, every
 * request is signed with an HMAC-SHA256 *message signature*:
 *
 *   rawSignature = apiKey + clientRequestId + timestamp + requestBody
 *   signature    = base64( HMAC-SHA256( rawSignature, apiSecret ) )
 *
 * The signature, key, a per-request UUID, and a millisecond timestamp ride in
 * request headers (see `client.ts`). The secret never leaves the server.
 *
 * We map this onto `Credentials` as:
 *   - accessToken       → API key (the public identifier sent as `Api-Key`)
 *   - extra.apiSecret   → API secret (HMAC key; never transmitted)
 *   - extra.environment → 'sandbox' | 'production' (selects the base URL)
 *
 * Docs: https://developer.fiserv.com/product/CommerceHub/docs/Developer-Resources/Authentication/Authentication.mdx
 */
import type { Credentials } from '@opensteward/shared'

export type FiservEnvironment = 'sandbox' | 'production'

export function buildCredentials(fields: Record<string, string>): Credentials {
  const apiKey = (fields.apiKey ?? '').trim()
  const apiSecret = (fields.apiSecret ?? '').trim()
  if (!apiKey) throw new Error('Fiserv API key is required.')
  if (!apiSecret) throw new Error('Fiserv API secret is required.')
  const environment: FiservEnvironment =
    fields.environment === 'production' ? 'production' : 'sandbox'
  // Optional. Fiserv documents merchantDetails.merchantId as not required but
  // sends it in its own examples, and a field that is optional in the schema
  // yet enforced at runtime for multi-merchant accounts is a common vendor
  // pattern. Storing it only when supplied keeps single-merchant connections
  // byte-identical to before.
  const merchantId = (fields.merchantId ?? '').trim()
  return {
    accessToken: apiKey,
    extra: { apiSecret, environment, ...(merchantId ? { merchantId } : {}) },
  }
}

export function apiKeyFrom(credentials: Credentials): string {
  return credentials.accessToken
}

export function apiSecretFrom(credentials: Credentials): string {
  return String((credentials.extra as Record<string, unknown> | undefined)?.apiSecret ?? '')
}

export function environmentFrom(credentials: Credentials): FiservEnvironment {
  const env = (credentials.extra as Record<string, unknown> | undefined)?.environment
  return env === 'production' ? 'production' : 'sandbox'
}

/** The merchant id a connection was configured with, when it has one. */
export function merchantIdFrom(credentials: Credentials): string | undefined {
  const raw = credentials.extra?.['merchantId']
  return typeof raw === 'string' && raw.trim() ? raw.trim() : undefined
}

/** `merchantDetails` for a request body, or nothing when unconfigured. */
export function merchantDetails(credentials: Credentials): Record<string, unknown> {
  const merchantId = merchantIdFrom(credentials)
  return merchantId ? { merchantDetails: { merchantId } } : {}
}
