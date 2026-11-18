/**
 * Chargebee authenticates with HTTP Basic — the API key is the username,
 * password is empty. Different keys can be scoped (full-access, read-only,
 * etc.) in the Chargebee dashboard. The merchant's site name is required
 * for URL construction.
 */
import type { Credentials } from '@opensteward/shared'

export function buildCredentials(fields: Record<string, string>): Credentials {
  return {
    accessToken: Buffer.from(`${fields.apiKey ?? ''}:`).toString('base64'),
    extra: { site: fields.site ?? '' },
  }
}
