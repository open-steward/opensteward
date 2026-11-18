/**
 * Bold Commerce OAuth (public integrations).
 *
 * https://developer.boldcommerce.com/guides/checkout/public-integrations:
 *  - install page: "https://apps.boldapps.net/accounts/dashboard/authorize?client_id={client_id}&scope=read_products&redirect_uri=..."
 *    with `scope` "The comma-separated list of access scopes your application requires."
 *  - token: "curl --request POST 'https://api.boldcommerce.com/auth/oauth2/token'
 *    --header 'Content-Type: application/x-www-form-urlencoded'
 *    --data 'client_id={client_id}&grant_type=authorization_code&client_secret={client_secret}&code={code}'"
 *    answering `{ "token_type": "bearer", "access_token": "..." }`.
 *  - "Once generated, API access tokens do not expire, and refresh tokens are not required."
 *
 * Every Bold resource path carries a `shop_identifier`, which the token
 * response does not: "Use the Get Shop Info endpoint to get your
 * shop_identifier" (`GET https://api.boldcommerce.com/shops/v1/info`). It is
 * read once here and stored on the connection as `extra.shopIdentifier`, with
 * the shop's `currency` ("The shop's selected currency, using ISO-4217
 * standards.") as `extra.currency` — the only documented currency for the
 * variant prices the Products API returns.
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { AUTHORIZE_URL, TOKEN_URL } from './constants'
import { BoldCommerceClient } from './client'

export function buildAuthUrl(
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
  return `${AUTHORIZE_URL}?${params.toString()}`
}

interface BoldTokenResponse {
  token_type: string
  access_token: string
}

/** The Shops API `ShopInfo` fields this adapter reads. */
export interface BoldShopInfo {
  shop_identifier: string
  currency?: string
}

export async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: 'authorization_code',
    client_secret: clientSecret,
    code,
  })
  const { data } = await axios.post<BoldTokenResponse>(TOKEN_URL, body.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
  })
  const credentials: Credentials = { accessToken: data.access_token }
  const shop = await new BoldCommerceClient(credentials).get<BoldShopInfo>('/shops/v1/info')
  if (!shop?.shop_identifier) {
    throw new Error('Bold Get Shop Info returned no shop_identifier')
  }
  // No expiresAt: Bold access tokens do not expire.
  return {
    accessToken: data.access_token,
    extra: {
      shopIdentifier: shop.shop_identifier,
      ...(shop.currency ? { currency: shop.currency } : {}),
    },
  }
}
