/**
 * Falabella Seller Center auth — static API key, no browser redirect.
 *
 * Credentials are a User ID (the seller's Seller Center email) plus a
 * static API key minted in the Seller Center UI — there is no OAuth flow
 * and keys do not expire, so `refreshCredentials` is a no-op.
 *
 * Docs: https://developers.falabella.com/docs/operate-with-apis
 */
import type { Credentials } from '@opensteward/shared'

export function buildAuthUrl(): string {
  return 'https://sellercenter.falabella.com/'
}

export function exchangeCode(): Promise<Credentials> {
  throw new Error(
    'Falabella Seller Center uses a static API key, not an authorization-code redirect. POST ' +
      'credentials to /v1/connections with body `{platform: "falabella", credentials: ' +
      '{userId, apiKey, sellerId, country}}`.',
  )
}

/** Falabella API keys are static — nothing to refresh. */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
