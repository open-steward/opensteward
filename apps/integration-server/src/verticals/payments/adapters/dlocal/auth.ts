/**
 * dLocal signs every request with HMAC-SHA-256 of
 * `${xLogin}${xDate}${body}` keyed with the merchant's secret key. The
 * signature ships as `Authorization: V2-HMAC-SHA256, Signature: …`.
 *
 * We carry the login + trans-key + secret in `Credentials.extra`; the
 * client computes the signature per-request.
 */
import type { Credentials } from '@opensteward/shared'
import { DEFAULT_ENVIRONMENT, type DLocalEnvironment } from './constants'

export function buildCredentials(fields: Record<string, string>): Credentials {
  return {
    accessToken: fields.secretKey ?? '',
    extra: {
      xLogin: fields.xLogin ?? '',
      xTransKey: fields.xTransKey ?? '',
      environment: (fields.environment as DLocalEnvironment) ?? DEFAULT_ENVIRONMENT,
    },
  }
}
