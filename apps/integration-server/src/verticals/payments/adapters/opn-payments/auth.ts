import type { Credentials } from '@opensteward/shared'

/**
 * Opn Payments uses HTTP Basic auth: API key as username, empty password.
 */
export function buildCredentials(fields: Record<string, string>): Credentials {
  const key = fields.apiKey ?? fields.secretKey ?? ''
  const encoded = Buffer.from(`${key}:`).toString('base64')
  return { accessToken: encoded }
}
