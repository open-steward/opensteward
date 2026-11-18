/**
 * Recurly authenticates with HTTP Basic — the API key is the username,
 * password is empty.
 */
import type { Credentials } from '@opensteward/shared'

export function buildCredentials(fields: Record<string, string>): Credentials {
  return {
    accessToken: Buffer.from(`${fields.apiKey ?? ''}:`).toString('base64'),
  }
}
