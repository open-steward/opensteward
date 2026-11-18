/**
 * BigCommerce OAuth2 helpers.
 *
 * BigCommerce uses a "single-click" OAuth install flow. The token endpoint
 * lives at `login.bigcommerce.com`. Access tokens are long-lived (no expiry),
 * so `refreshCredentials` on the adapter is a no-op — identical to Shopify.
 *
 * Docs: https://developer.bigcommerce.com/docs/start/authentication/api-accounts
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'

export function buildAuthUrl(
  clientId: string,
  redirectUri: string,
  scopes: string[],
  state: string,
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes.join(' '),
    state,
  })
  return `https://login.bigcommerce.com/oauth2/authorize?${params.toString()}`
}

interface BigCommerceTokenResponse {
  access_token: string
  scope?: string
  context?: string // "stores/{store_hash}"
}

export async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): Promise<Credentials> {
  const { data } = await axios.post<BigCommerceTokenResponse>(
    'https://login.bigcommerce.com/oauth2/token',
    {
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    },
    {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    },
  )

  // The store is named only here — `context` is "stores/{store_hash}". It has
  // to land in `extra`: a top-level field is not persisted, and the API client
  // cannot build a single URL without it.
  const storeHash = parseStoreContext(data.context)
  if (!storeHash) {
    throw new Error(
      'BigCommerce token response did not identify the store (missing or malformed `context`).',
    )
  }

  // No expiresAt — BigCommerce access tokens do not expire.
  return {
    accessToken: data.access_token,
    scope: data.scope,
    extra: { storeHash },
  }
}

/** Store hashes are opaque alphanumerics spliced into the API path. */
const STORE_HASH = /^[A-Za-z0-9]+$/

/** `stores/abc123` → `abc123`; anything else → undefined. */
export function parseStoreContext(context: string | undefined): string | undefined {
  const match = /^stores\/(.+)$/.exec((context ?? '').trim())
  const hash = match?.[1]
  return hash && STORE_HASH.test(hash) ? hash : undefined
}

/**
 * The store hash for API calls: the one recorded with the connection, else a
 * deployment-wide fallback. Throws before any request when neither is usable.
 */
export function resolveStoreHash(stored: unknown, fallback: string | undefined): string {
  const raw = typeof stored === 'string' && stored.trim() ? stored : fallback
  const hash = (raw ?? '').trim()
  if (!hash) {
    throw new Error('BigCommerce store hash is missing from the connection — reconnect the store.')
  }
  if (!STORE_HASH.test(hash)) {
    throw new Error('BigCommerce store hash is malformed: expected letters and digits only.')
  }
  return hash
}
