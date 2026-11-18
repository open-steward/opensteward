import type { Credentials } from '@opensteward/shared'

/**
 * Paytrail uses HMAC-signed requests (public key + secret).
 */
export function buildCredentials(fields: Record<string, string>): Credentials {
  return {
    accessToken: fields.apiKey ?? fields.publicKey ?? '',
    refreshToken: fields.secretKey ?? fields.apiSecret ?? '',
  }
}
