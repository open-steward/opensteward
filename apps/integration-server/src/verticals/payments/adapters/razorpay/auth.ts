import type { Credentials } from '@opensteward/shared'

export function buildCredentials(fields: Record<string, string>): Credentials {
  return {
    accessToken: Buffer.from(`${fields.keyId ?? ''}:${fields.keySecret ?? ''}`).toString('base64'),
  }
}
