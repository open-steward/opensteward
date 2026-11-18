/**
 * Authorize.Net wraps credentials in a `merchantAuthentication` block on
 * every request — `name` is the API Login ID, `transactionKey` is the
 * Transaction Key. Both come from the merchant dashboard.
 */
import type { Credentials } from '@opensteward/shared'
import { DEFAULT_ENVIRONMENT, type AuthNetEnvironment } from './constants'

export function buildCredentials(fields: Record<string, string>): Credentials {
  return {
    accessToken: fields.transactionKey ?? '',
    extra: {
      loginId: fields.loginId ?? '',
      environment: (fields.environment as AuthNetEnvironment) ?? DEFAULT_ENVIRONMENT,
    },
  }
}

export function authBlockFrom(credentials: Credentials): {
  name: string
  transactionKey: string
} {
  const extra = (credentials.extra as Record<string, unknown> | undefined) ?? {}
  return {
    name: String(extra.loginId ?? ''),
    transactionKey: credentials.accessToken,
  }
}
