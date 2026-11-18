/**
 * Kaufland Marketplace Seller API auth helpers.
 *
 * Kaufland uses HMAC-SHA256 request signing — NOT OAuth2. Every request is
 * authenticated by generating a per-request signature from the HTTP method,
 * full request URI, request body (empty string for GET/DELETE), and the
 * current Unix timestamp. The signature and associated headers are added to
 * each outgoing request by the client.
 *
 * Credentials are a Client Key (32 chars, public) + Secret Key (64 chars,
 * private) issued from the Kaufland Seller Portal at:
 *   https://sellerportal.kaufland.de/settings/api
 *
 * There is no OAuth code-exchange flow. Credentials are passed directly via
 * `POST /v1/connections` with
 *   `{ platform: 'kaufland-marketplace', credentials: { clientKey, secretKey } }`
 *
 * Docs: https://sellerapi.kaufland.com/?page=rest-api
 */

import { createHmac } from 'node:crypto'
import type { Credentials } from '@opensteward/shared'

/**
 * Build the HMAC-SHA256 signature string required by every Kaufland API
 * request. The message is:
 *
 *   METHOD\nURI\nBODY\nTIMESTAMP
 *
 * where BODY is the raw JSON string for POST/PATCH requests, or an empty
 * string for GET/DELETE requests.
 *
 * The signature is the hex-encoded SHA-256 HMAC, signed with the plain-text
 * Secret Key (not hex-decoded — Kaufland treats it as a UTF-8 string).
 */
export function buildSignature(
  method: string,
  uri: string,
  body: string,
  timestamp: number,
  secretKey: string,
): string {
  const message = [method.toUpperCase(), uri, body, String(timestamp)].join('\n')
  return createHmac('sha256', secretKey).update(message, 'utf8').digest('hex')
}

/**
 * Kaufland does not use an OAuth authorize URL. This informational URL
 * points the seller to the API settings page in the Seller Portal where
 * they can generate credentials.
 */
export function buildAuthUrl(): string {
  return 'https://sellerportal.kaufland.de/settings/api'
}

export function exchangeCode(): Promise<Credentials> {
  throw new Error(
    'Kaufland Marketplace does not use OAuth code exchange. ' +
      'Generate a Client Key and Secret Key in the Kaufland Seller Portal at ' +
      'https://sellerportal.kaufland.de/settings/api, then POST them to ' +
      '/v1/connections with body ' +
      '`{platform: "kaufland-marketplace", credentials: {clientKey, secretKey}}`.',
  )
}
