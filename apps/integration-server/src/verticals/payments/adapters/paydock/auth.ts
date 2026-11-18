import type { Credentials } from '@opensteward/shared'

/**
 * Paydock authenticates server-side calls with the API Secret Key, sent in the
 * `x-user-secret-key` header (see client.ts).
 */
export function buildCredentials(fields: Record<string, string>): Credentials {
  return { accessToken: fields.apiKey ?? fields.secretKey ?? '' }
}
