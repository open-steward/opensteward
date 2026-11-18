/**
 * NMI authenticates every Payment API + Query API call with a single
 * `security_key` (the "API" key from the merchant control panel). There is no
 * OAuth — the key is submitted through the Connect Link form. We store it on
 * `accessToken` and keep the chosen host (sandbox vs live) on `extra.environment`.
 *
 * Docs: https://docs.nmi.com/docs/getting-your-api-keys
 */
import type { Credentials } from '@opensteward/shared'
import { DEFAULT_ENVIRONMENT, type NmiEnvironment } from './constants'

export function buildCredentials(fields: Record<string, string>): Credentials {
  const securityKey = (fields.securityKey ?? '').trim()
  if (!securityKey) throw new Error('Security key is required.')
  const environment = (fields.environment as NmiEnvironment) ?? DEFAULT_ENVIRONMENT
  return {
    accessToken: securityKey,
    extra: { environment },
  }
}

export function securityKeyFrom(credentials: Credentials): string {
  return credentials.accessToken
}

export function environmentFrom(credentials: Credentials): NmiEnvironment {
  const extra = (credentials.extra as Record<string, unknown> | undefined) ?? {}
  return (extra.environment as NmiEnvironment) ?? DEFAULT_ENVIRONMENT
}
