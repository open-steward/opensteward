/**
 * Flutterwave uses Bearer-token auth — the merchant's secret key
 * (FLWSECK_TEST-… or FLWSECK-…). Pass through unchanged.
 */
import type { Credentials } from '@opensteward/shared'

export function buildCredentials(fields: Record<string, string>): Credentials {
  return { accessToken: fields.secretKey ?? '' }
}
