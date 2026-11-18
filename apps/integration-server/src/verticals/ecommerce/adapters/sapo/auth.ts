/**
 * Sapo OAuth2 helpers.
 *
 * Sapo's OAuth is per-store: the authorize and token endpoints live on the
 * store's own `{store}.mysapo.net` host. Tokens issued by the OAuth install
 * flow are long-lived (Sapo does NOT issue refresh tokens for offline-access
 * tokens), so `refreshCredentials` on the adapter is a no-op.
 *
 * Private apps instead use HTTP Basic authentication with the API key and
 * API secret generated from the Sapo partner dashboard. The adapter supports
 * both modes — OAuth tokens are stored in `credentials.accessToken`; private-
 * app credentials store the API key in `credentials.accessToken` and the
 * secret in `credentials.extra.apiSecret`.
 *
 * Docs: https://support.sapo.vn/oauth
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'

export function storeHost(store: string): string {
  // Accept either "mystore" or "mystore.mysapo.net"
  return store.endsWith('.mysapo.net') ? store : `${store}.mysapo.net`
}

export function buildAuthUrl(
  store: string,
  clientId: string,
  redirectUri: string,
  scopes: string[],
  state: string,
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    scope: scopes.join(','),
    redirect_uri: redirectUri,
    state,
  })
  return `https://${storeHost(store)}/admin/oauth/authorize?${params.toString()}`
}

interface SapoTokenResponse {
  access_token: string
  scope?: string
}

export async function exchangeCode(
  store: string,
  code: string,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  const { data } = await axios.post<SapoTokenResponse>(
    `https://${storeHost(store)}/admin/oauth/access_token`,
    {
      client_id: clientId,
      client_secret: clientSecret,
      code,
    },
    {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    },
  )

  // No expiresAt — Sapo offline tokens do not expire.
  return {
    accessToken: data.access_token,
    scope: data.scope,
  }
}
