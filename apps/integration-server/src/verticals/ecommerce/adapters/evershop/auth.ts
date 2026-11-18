/**
 * EverShop auth helpers.
 *
 * EverShop does NOT use OAuth2's authorization-code flow. Admin credentials
 * are an email + password pair configured during installation. The adapter
 * exchanges them for a short-lived JWT (15 min by default) via
 * `POST /api/user/tokens`.
 *
 * Because EverShop is self-hosted and has no SaaS authorization URL, the
 * credential model used here is "custom form" — the caller supplies
 * `{ baseUrl, email, password }` via `POST /v1/connections` and the adapter
 * fetches the JWT on first use.
 *
 * NOTE: EverShop does NOT have a refresh-token endpoint. The token response
 * returns a single `data.token` JWT. When it expires the adapter must
 * re-authenticate with the original email + password.
 *
 * Docs: https://evershop.io/docs/api/authentication
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { TOKEN_PATH } from './constants'

/**
 * Real shape returned by POST /api/user/tokens.
 * The API returns `{ data: { token: "<jwt>" } }`.
 */
interface EvershopTokenResponse {
  data: {
    token: string
  }
}

/**
 * Exchange admin email + password for a JWT access token.
 *
 * `baseUrl` should be the root of the EverShop installation,
 * e.g. `https://shop.example.com`.
 *
 * Returns canonical `Credentials`:
 *  - `accessToken`  → the short-lived JWT
 *  - `extra.baseUrl`  → stored so the client can be reconstructed
 */
export async function fetchAdminToken(
  baseUrl: string,
  email: string,
  password: string,
): Promise<Credentials> {
  const { data } = await axios.post<EvershopTokenResponse>(
    `${baseUrl.replace(/\/$/, '')}${TOKEN_PATH}`,
    { email, password },
    {
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      timeout: 30_000,
    },
  )
  return {
    accessToken: data.data.token,
    extra: {
      baseUrl: baseUrl.replace(/\/$/, ''),
    },
  }
}

/**
 * EverShop does NOT expose a refresh-token endpoint.
 * Return the existing credentials unchanged so the adapter's
 * `refreshCredentials` path is a no-op rather than a 404.
 * When the JWT actually expires the caller must re-authenticate via
 * `fetchAdminToken`.
 */
export function refreshAdminToken(credentials: Credentials): Promise<Credentials> {
  return Promise.resolve(credentials)
}

/**
 * EverShop is self-hosted — there is no hosted OAuth authorization URL.
 * Returns a placeholder pointing to the store's admin login page.
 */
export function buildAuthUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, '')}/admin/login`
}

/**
 * EverShop does not use OAuth code exchange. Throw with clear instructions
 * so ambiguous callers fail loudly.
 */
export function exchangeCode(): Promise<Credentials> {
  throw new Error(
    'EverShop does not use OAuth code exchange. ' +
      'Supply credentials via POST /v1/connections with body ' +
      '`{ platform: "evershop", credentials: { baseUrl, email, password } }` — ' +
      'the adapter calls POST /api/user/tokens to obtain a JWT.',
  )
}
