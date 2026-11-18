/**
 * Paystack uses Bearer-token auth. Test keys start `sk_test_`, live keys
 * `sk_live_`.
 */
import type { Credentials } from '@opensteward/shared'

export function buildCredentials(fields: Record<string, string>): Credentials {
  return { accessToken: fields.secretKey ?? '' }
}
