/**
 * Nacelle auth helpers.
 *
 * Nacelle does not use an OAuth2 authorization-code flow for this adapter's
 * scope. A Space admin creates "Client Credentials" in the dashboard and
 * exchanges them for a Private Access Token
 * (https://docs.nacelle.com/docs/auth-credentials,
 * https://docs.nacelle.com/docs/auth-storefront) — that token is what this
 * adapter is handed directly via the Connect Link credential form, alongside
 * the Space ID. `getAuthUrl` / `exchangeCode` exist only to satisfy
 * `BaseAdapter` and fail loudly if ever reached.
 */
import type { Credentials } from '@opensteward/shared'

/** Informational only — points the operator at the Space Settings page where credentials live. */
export function buildAuthUrl(): string {
  return 'https://dashboard.nacelle.com/'
}

export function exchangeCode(): Promise<Credentials> {
  throw new Error(
    'Nacelle does not use OAuth code exchange. Generate a Private Access Token ' +
      '(Space Settings → API Details → Client Credentials, see ' +
      'https://docs.nacelle.com/docs/auth-credentials) and POST it to ' +
      '/v1/connections with credentials: { spaceId, accessToken }.',
  )
}
