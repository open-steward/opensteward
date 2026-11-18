/**
 * MyCashflow auth helpers.
 *
 * MyCashflow does not implement an OAuth 2.0 authorisation-code flow. Access
 * is via HTTP Basic Auth: an API user account is created in the store admin
 * panel and its username + password (the API key) are passed on every request
 * as a Base64-encoded `Authorization: Basic <b64>` header.
 *
 * The adapter exposes a `customForm` credential form with three fields:
 *  - `storeName`  — the store subdomain (e.g. `myshop`)
 *  - `username`   — the API user account name
 *  - `password`   — the API user account password / key
 *
 * Docs: https://support.mycashflow.com/api/8-authentication/
 */

import type { Credentials } from '@opensteward/shared'

/**
 * Encode Basic Auth credentials to a base64 token.
 */
export function encodeBasicAuth(username: string, password: string): string {
  return Buffer.from(`${username}:${password}`).toString('base64')
}

/**
 * Build the Authorization header value for Basic Auth.
 */
export function buildAuthHeader(username: string, password: string): string {
  return `Basic ${encodeBasicAuth(username, password)}`
}

/**
 * `exchangeCredentials` implementation for the `customForm` template.
 *
 * Stores the storeName, username, and password in `credentials.extra` so the
 * client can retrieve them. `accessToken` is set to the encoded Basic Auth
 * token for convenience.
 */
export async function exchangeCredentials(
  fields: Record<string, string>,
): Promise<Credentials> {
  const storeName = (fields['storeName'] ?? '').trim()
  const username = (fields['username'] ?? '').trim()
  const password = (fields['password'] ?? '').trim()

  if (!storeName) throw new Error('Store name is required.')
  if (!username) throw new Error('Username is required.')
  if (!password) throw new Error('Password / API key is required.')

  return {
    accessToken: encodeBasicAuth(username, password),
    extra: { storeName, username, password },
  }
}
