/**
 * Affirm uses HTTP Basic from a `public_api_key:private_api_key` pair
 * generated in the Affirm dashboard.
 */
import type { Credentials } from '@opensteward/shared'
import { DEFAULT_ENVIRONMENT, type AffirmEnvironment } from './constants'

export function buildCredentials(fields: Record<string, string>): Credentials {
  return {
    accessToken: Buffer.from(`${fields.publicKey ?? ''}:${fields.privateKey ?? ''}`).toString('base64'),
    extra: { environment: (fields.environment as AffirmEnvironment) ?? DEFAULT_ENVIRONMENT },
  }
}
