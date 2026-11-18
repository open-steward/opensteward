/**
 * Cybersource uses HTTP Signature authentication — every request is signed
 * with HMAC-SHA-256 of a canonicalised digest of headers + body, using the
 * shared secret-key. We carry the merchant ID, key ID, and secret in
 * `Credentials.extra`; the client computes the signature per request.
 *
 * Docs: https://developer.cybersource.com/api-reference-assets/index.html#authentication
 */
import type { Credentials } from '@opensteward/shared'
import { DEFAULT_ENVIRONMENT, type CybersourceEnvironment } from './constants'

export function buildCredentials(fields: Record<string, string>): Credentials {
  return {
    accessToken: fields.secretKey ?? '',
    extra: {
      merchantId: fields.merchantId ?? '',
      keyId: fields.keyId ?? '',
      environment: (fields.environment as CybersourceEnvironment) ?? DEFAULT_ENVIRONMENT,
    },
  }
}
