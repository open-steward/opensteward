import type { Credentials } from '@opensteward/shared'

/**
 * A Yoco API key, sent as a bearer token.
 *
 * https://developer.yoco.com/docs/api/authentication/api-keys.md: "API keys
 * enable personal applications to access data for a single business owned by
 * the user via the Yoco API." https://developer.yoco.com/docs/api/authentication.md:
 * "Attach the authentication token as a bearer token in the `Authorization` header."
 */
export function buildCredentials(fields: Record<string, string>): Credentials {
  const apiKey = fields.apiKey?.trim()
  if (!apiKey) throw new Error('Yoco: an API key is required')
  return { accessToken: apiKey }
}
