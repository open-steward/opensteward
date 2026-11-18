/**
 * 2Checkout (Verifone) REST 6.0 authentication.
 *
 * 2Checkout does NOT use OAuth or a single bearer token. Every request carries
 * an `X-Avangate-Authentication` header that proves possession of two secrets
 * issued in the Merchant Control Panel:
 *
 *   - Merchant Code  — the public account identifier.
 *   - Secret Key     — the HMAC key, never sent over the wire.
 *
 * The header is `X-Avangate-Authentication: code="…" date="…" hash="…" algo="…"`
 * where `hash` is `HMAC-SHA256(LEN(code)+code+LEN(date)+date, secretKey)` and
 * `date` is the current UTC time formatted `Y-m-d H:i:s`. Because the hash is
 * time-boxed it must be recomputed per request — see {@link buildAuthHeader} in
 * `client.ts`.
 *
 * We model this as an `api_key`-style flow: the customer submits both secrets
 * via the Connect Link form, and we stash them on the credential record so the
 * client can sign each call.
 *
 * Docs: https://docs.2checkout.com/get-started-with-the-2checkout-api/get-started-with-the-2checkout-api/authentication-and-use-cases/api-authentication
 */
import type { Credentials } from '@opensteward/shared'

export interface Verifone2checkoutSecrets {
  merchantCode: string
  secretKey: string
}

/**
 * Build a credential record from the submitted Connect Link fields. We store
 * the merchant code as `accessToken` (the public identifier) and keep both
 * secrets on `extra` so per-request signing has what it needs.
 */
export function buildCredentials(fields: Record<string, string>): Credentials {
  const merchantCode = (fields.merchantCode ?? '').trim()
  const secretKey = fields.secretKey ?? ''
  if (!merchantCode) throw new Error('2Checkout merchant code is required.')
  if (!secretKey) throw new Error('2Checkout secret key is required.')
  return {
    accessToken: merchantCode,
    extra: { merchantCode, secretKey },
  }
}

/** Pull the merchant code + secret key back off a credential record. */
export function extractSecrets(credentials: Credentials): Verifone2checkoutSecrets {
  const extra = (credentials.extra ?? {}) as Record<string, unknown>
  const merchantCode = String(extra.merchantCode ?? credentials.accessToken ?? '')
  const secretKey = String(extra.secretKey ?? '')
  if (!merchantCode || !secretKey) {
    throw new Error('2Checkout credentials are missing the merchant code or secret key.')
  }
  return { merchantCode, secretKey }
}
