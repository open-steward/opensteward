/**
 * Cashfree PG authenticates with a static key pair sent on every request:
 *   x-client-id      ← appId
 *   x-client-secret  ← secretKey
 * plus a dated `x-api-version`. There is no OAuth/token-exchange step.
 *
 * The same `secretKey` doubles as the HMAC key for webhook-signature
 * verification, so we keep it as the primary `accessToken`. The client id
 * and the chosen environment travel in `Credentials.extra`.
 *
 * Docs: https://www.cashfree.com/docs/api-reference/authentication
 */
import type { Credentials } from '@opensteward/shared'
import { DEFAULT_ENVIRONMENT, HOSTS, type CashfreeEnvironment } from './constants'

function pickEnvironment(value: string | undefined): CashfreeEnvironment {
  return value && value in HOSTS ? (value as CashfreeEnvironment) : DEFAULT_ENVIRONMENT
}

export function buildCredentials(fields: Record<string, string>): Credentials {
  const clientId = (fields.clientId ?? '').trim()
  const clientSecret = (fields.clientSecret ?? '').trim()
  if (!clientId) throw new Error('Client ID (x-client-id) is required.')
  if (!clientSecret) throw new Error('Client secret (x-client-secret) is required.')
  return {
    accessToken: clientSecret,
    extra: {
      clientId,
      environment: pickEnvironment(fields.environment),
    },
  }
}
