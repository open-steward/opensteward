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

/**
 * Reduce whatever a customer typed for their store to the bare subdomain:
 * `my-store`, `my-store.myshopify.com`, `https://my-store.myshopify.com/admin`
 * all become `my-store`. Rejects blanks and any host outside `myshopify.com`,
 * because the token exchange POSTs the client secret to this host.
 */
export function normaliseShop(raw: string | undefined | null): string {
  const s = (raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/[/?#].*$/, '')
  if (!s) throw new Error('Shopify store is required (e.g. my-store or my-store.myshopify.com).')
  if (s.includes('.') && !s.endsWith('.myshopify.com'))
    throw new Error('Shopify store must be a *.myshopify.com host.')
  const sub = s.replace(/\.myshopify\.com$/, '')
  if (!sub || sub.includes('.'))
    throw new Error('Shopify store must be a *.myshopify.com host.')
  return sub
}

function shopHost(shop: string): string {
  return `${normaliseShop(shop)}.myshopify.com`
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
