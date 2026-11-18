/**
 * GoCardless authentication: a per-connection access token, entered through
 * the Connect Link form (credentialFields), so the platform's auth_type is
 * 'api_key'.
 *
 *   "After creating an access token in the dashboard, pass it in an
 *    `Authorization` header using the bearer scheme"
 *   https://docs.gocardless.com/docs/api-reference/making-requests
 *
 * GoCardless also documents OAuth, but only for partner apps acting on other
 * accounts: "OAuth allows you to act on behalf of other GoCardless accounts",
 * with an app's `client_id`/`client_secret` issued from the dashboard
 * (https://docs.gocardless.com/docs/api-reference/oauth-reference). This
 * adapter does not implement that flow; its getAuthUrl and exchangeCode throw.
 */
import type { Credentials } from '@opensteward/shared'

export function buildCredentials(fields: Record<string, string>): Credentials {
  return {
    accessToken: fields.accessToken ?? '',
    extra: { environment: fields.environment ?? 'sandbox' },
  }
}

export function environmentFrom(credentials: Credentials): 'live' | 'sandbox' {
  const env = (credentials.extra as Record<string, unknown> | undefined)?.environment
  return env === 'live' ? 'live' : 'sandbox'
}
