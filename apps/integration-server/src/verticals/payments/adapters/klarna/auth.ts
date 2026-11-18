/**
 * Klarna authenticates with HTTP Basic auth derived from a `username:password`
 * pair generated in the Klarna Merchant Portal. Submit via the Connect Link
 * form along with the region the keys belong to.
 */
import type { Credentials } from '@opensteward/shared'
import { DEFAULT_REGION, type KlarnaRegion } from './constants'

export function buildCredentials(fields: Record<string, string>): Credentials {
  const username = fields.username ?? ''
  const password = fields.password ?? ''
  const region = (fields.region as KlarnaRegion) ?? DEFAULT_REGION
  return {
    accessToken: Buffer.from(`${username}:${password}`).toString('base64'),
    extra: { region },
  }
}
