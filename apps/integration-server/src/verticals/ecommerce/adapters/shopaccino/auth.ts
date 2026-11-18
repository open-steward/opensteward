/**
 * Shopify OAuth2 helpers.
 *
 * Shopify's OAuth is per-shop: the authorize and token endpoints live on the
 * shop's own `{shop}.myshopify.com` host. Tokens issued by the standard
 * install flow are long-lived offline tokens (Shopify does NOT rotate them),
 * so `refreshCredentials` on the adapter is a no-op.
 *
 * Docs: https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/authorization-code-grant
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'

function shopHost(shop: string): string {
  // Accept either "mystore" or "mystore.myshopify.com"
  return shop.endsWith('.myshopify.com') ? shop : `${shop}.myshopify.com`
}

export function buildAuthUrl(
  shop: string,
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
  return `https://${shopHost(shop)}/admin/oauth/authorize?${params.toString()}`
}

interface ShopifyTokenResponse {
  access_token: string
  scope?: string
}

export async function exchangeCode(
  shop: string,
  code: string,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  const { data } = await axios.post<ShopifyTokenResponse>(
    `https://${shopHost(shop)}/admin/oauth/access_token`,
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

  // No expiresAt — Shopify offline tokens do not expire.
  return {
    accessToken: data.access_token,
    scope: data.scope,
  }
}
