/**
 * Braintree uses HTTP Basic auth derived from `publicKey:privateKey`. The
 * merchantId is required for some GraphQL queries; both are stored under
 * `Credentials.extra`.
 */

import type { Credentials } from '@opensteward/shared'

export function buildCredentials(fields: Record<string, string>): Credentials {
  return {
    accessToken: Buffer.from(`${fields.publicKey ?? ''}:${fields.privateKey ?? ''}`).toString('base64'),
    extra: {
      environment: fields.environment ?? 'sandbox',
      merchantId: fields.merchantId ?? '',
    },
  }
}

export function environmentFrom(credentials: Credentials): 'production' | 'sandbox' {
  const env = (credentials.extra as Record<string, unknown> | undefined)?.environment
  return env === 'production' ? 'production' : 'sandbox'
}
