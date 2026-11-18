import type { Credentials } from '@opensteward/shared'

/**
 * Rebill authenticates with an API key sent in the `x-api-key` header
 * (https://docs.rebill.com/api/reference/authentication): "Every request to
 * the Rebill API must include an API key in the `x-api-key` header."
 * The key is stored as the connection's accessToken; client.ts sends it.
 */
export function buildCredentials(fields: Record<string, string>): Credentials {
  const apiKey = fields.apiKey
  if (typeof apiKey !== 'string' || apiKey.trim() === '') {
    throw new Error('Rebill requires an API key (apiKey)')
  }
  return { accessToken: apiKey }
}
