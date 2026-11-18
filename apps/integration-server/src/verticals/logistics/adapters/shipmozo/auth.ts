import type { Credentials } from '../../adapter/interface'
import { SHIPMOZO_DASHBOARD_URL } from './constants'

/**
 * Shipmozo authenticates every call with two headers, "public-key" ("Api
 * Public Key") and "private-key" ("Api Private Key")
 * (https://shipping-api.com/api/v1?api-docs-v1.json). The API documentation
 * PDF: "All API requests must include both a public-key and private-key in
 * the request headers." There is no OAuth flow and the keys do not expire.
 *
 * Stored as `accessToken` = public key, `extra.privateKey` = private key.
 */

export function buildAuthUrl(_state: string): string {
  return SHIPMOZO_DASHBOARD_URL
}

export async function exchangeApiKeys(publicKey: string, privateKey: string): Promise<Credentials> {
  return { accessToken: publicKey, extra: { privateKey } }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
