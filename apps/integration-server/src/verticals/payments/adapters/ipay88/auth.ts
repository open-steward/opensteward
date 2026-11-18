import type { Credentials } from '@opensteward/shared'

/**
 * iPay88 uses an API key passed as a Bearer token.
 */
export function buildCredentials(fields: Record<string, string>): Credentials {
  return { accessToken: fields.apiKey ?? fields.secretKey ?? '' }
}
