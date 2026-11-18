/**
 * FawryPay authentication.
 *
 * Fawry's server (ECommerceWeb) API is an `api_key`-style integration: the
 * merchant supplies a `merchantCode` (the public account identifier) and a
 * `secureKey` (a.k.a. "merchant secure hash key" — the secret HMAC material).
 * There is no OAuth flow and no Bearer token. Instead, every request carries a
 * per-request SHA-256 `signature` derived from selected request fields
 * concatenated with the `secureKey`; the `secureKey` itself never leaves the
 * server.
 *
 * One credential pair is bound to a single environment (staging vs
 * production), selected here via the `environment` field.
 *
 * We map this onto `Credentials` as:
 *   - accessToken       → merchantCode (public identifier sent on every request)
 *   - extra.secureKey   → merchant secure hash key (signing secret; never sent)
 *   - extra.environment → 'staging' | 'production' (selects the base URL)
 *
 * Docs: https://developer.fawrystaging.com/docs/server-apis/create-payment-refno-apis
 */
import type { Credentials } from '@opensteward/shared'

export type FawryEnvironment = 'staging' | 'production'

export function buildCredentials(fields: Record<string, string>): Credentials {
  const merchantCode = (fields.merchantCode ?? '').trim()
  const secureKey = (fields.secureKey ?? '').trim()
  if (!merchantCode) throw new Error('Fawry merchant code is required.')
  if (!secureKey) throw new Error('Fawry secure key is required.')
  const environment: FawryEnvironment =
    fields.environment === 'production' ? 'production' : 'staging'
  return { accessToken: merchantCode, extra: { secureKey, environment } }
}

export function merchantCodeFrom(credentials: Credentials): string {
  return credentials.accessToken
}

export function secureKeyFrom(credentials: Credentials): string {
  return String((credentials.extra as Record<string, unknown> | undefined)?.secureKey ?? '')
}

export function environmentFrom(credentials: Credentials): FawryEnvironment {
  const env = (credentials.extra as Record<string, unknown> | undefined)?.environment
  return env === 'production' ? 'production' : 'staging'
}
