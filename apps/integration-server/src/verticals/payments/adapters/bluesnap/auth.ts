/**
 * BlueSnap authenticates the Payment API with HTTP Basic auth. The merchant
 * generates an API username + password in the Merchant Portal under
 * Settings → API Settings; sandbox and production carry separate
 * credentials.
 *
 * We store the Base64-encoded `username:password` as `accessToken` (the
 * client prefixes it with `Basic `) and keep the chosen environment on
 * `extra` so the client can resolve sandbox vs. production at request time.
 *
 * Docs: https://developers.bluesnap.com/reference/authentication
 */
import type { Credentials } from '@opensteward/shared'
import { DEFAULT_ENVIRONMENT } from './constants'

export function buildCredentials(fields: Record<string, string>): Credentials {
  const username = (fields.apiUsername ?? '').trim()
  const password = fields.apiPassword ?? ''
  if (!username || !password) {
    throw new Error('BlueSnap API username and password are required.')
  }
  const environment = fields.environment === 'production' ? 'production' : DEFAULT_ENVIRONMENT
  return {
    accessToken: Buffer.from(`${username}:${password}`).toString('base64'),
    extra: { environment },
  }
}

export function environmentOf(credentials: Credentials): string {
  const env = (credentials.extra as { environment?: string } | undefined)?.environment
  return env === 'production' ? 'production' : DEFAULT_ENVIRONMENT
}
