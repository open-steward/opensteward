/**
 * CoinGate authenticates with a single API token sent in the `Authorization`
 * header as `Authorization: Token YOUR_API_TOKEN` (note the literal scheme
 * word `Token`, not `Bearer`). There is no OAuth flow and no refresh token —
 * the token *is* the credential, so we stash it verbatim on `accessToken`.
 *
 * Live and sandbox are entirely separate environments with separate tokens;
 * the token alone doesn't reveal which host to hit, so the merchant also
 * picks an environment on the form. We persist it on `credentials.extra` so
 * the client can resolve the right base URL.
 *
 * Docs: https://developer.coingate.com/docs/api-authentication
 */
import type { Credentials } from '@opensteward/shared'

export function buildCredentials(fields: Record<string, string>): Credentials {
  const environment = (fields.environment ?? 'live').trim().toLowerCase()
  return {
    accessToken: (fields.apiToken ?? '').trim(),
    extra: { environment: environment === 'sandbox' ? 'sandbox' : 'live' },
  }
}

/** Read the stored environment flag (defaults to live). */
export function environmentOf(credentials: Credentials): string {
  const env = credentials.extra?.['environment']
  return env === 'sandbox' ? 'sandbox' : 'live'
}
