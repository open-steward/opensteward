/**
 * Pinduoduo Open Platform auth helpers — MD5 request signing.
 *
 * Pinduoduo does NOT use OAuth2. Credentials are static API keys issued from
 * the PDD Open Platform seller portal. There is no token expiry or refresh.
 *
 * Credentials layout:
 *   - `accessToken`        clientId (stored as accessToken for consistency)
 *   - `extra.clientSecret` client secret used for MD5 signing
 *
 * Signing algorithm (MD5):
 *   1. Sort all request params alphabetically by key (excluding `sign` itself)
 *   2. Concatenate: clientSecret + key1value1key2value2... + clientSecret
 *   3. sign = MD5(concatenated_string).toUpperCase()
 *
 * All calls POST to:  https://open-api.pinduoduo.com/api/router
 *
 * Docs: https://open.pinduoduo.com/application/document/api
 */

import crypto from 'crypto'
import type { Credentials } from '@opensteward/shared'
import {
  PDD_ENDPOINT,
  API_VERSION,
  RESPONSE_FORMAT,
} from './constants'

// ── Signing ───────────────────────────────────────────────────────────────────

/**
 * Compute the PDD MD5 request signature.
 *
 * The clientSecret wraps the concatenated sorted params on both sides
 * (same pattern as Alibaba TOP). All param values are coerced to strings.
 *
 * @param params        All request parameters (excluding `sign` itself)
 * @param clientSecret  Client secret used as the MD5 salt wrapper
 * @returns             Uppercase hex MD5 digest
 */
export function buildSign(
  params: Record<string, string>,
  clientSecret: string,
): string {
  const sortedKeys = Object.keys(params).sort()
  let raw = clientSecret
  for (const key of sortedKeys) {
    raw += key + params[key]!
  }
  raw += clientSecret
  return crypto.createHash('md5').update(raw, 'utf8').digest('hex').toUpperCase()
}

// ── Request assembly ──────────────────────────────────────────────────────────

/**
 * Compute a Unix timestamp in seconds (PDD requires seconds, not ms).
 */
export function pddTimestamp(): number {
  return Math.floor(Date.now() / 1000)
}

/**
 * Assemble the full PDD request params including system params and the
 * computed MD5 signature. Ready to POST as a URL-encoded form body.
 *
 * @param type          PDD API method name (e.g. `pdd.goods.list.get`)
 * @param clientId      PDD client ID (stored as accessToken in Credentials)
 * @param clientSecret  PDD client secret for signing
 * @param extra         Method-specific params (values coerced to strings)
 * @returns             Complete signed params object
 */
export function buildRequestParams(
  type: string,
  clientId: string,
  clientSecret: string,
  extra: Record<string, string | number | boolean | undefined> = {},
): Record<string, string> {
  const base: Record<string, string> = {
    type,
    client_id: clientId,
    timestamp: String(pddTimestamp()),
    data_type: RESPONSE_FORMAT,
    version: API_VERSION,
  }

  // Merge extra params, skipping undefined values
  for (const [k, v] of Object.entries(extra)) {
    if (v !== undefined) {
      base[k] = String(v)
    }
  }

  const sign = buildSign(base, clientSecret)
  return { ...base, sign }
}

/**
 * Extract credentials from a Credentials object for use with PDD API calls.
 *
 * @param credentials  Connection credentials
 * @returns            { clientId, clientSecret }
 * @throws             If clientId or clientSecret are missing
 */
export function extractPddCredentials(credentials: Credentials): {
  clientId: string
  clientSecret: string
} {
  const clientId = credentials.accessToken
  const clientSecret = credentials.extra?.['clientSecret'] as string | undefined

  if (!clientId) {
    throw new Error(
      'PDD credentials: accessToken (clientId) is required. ' +
        'Store the PDD client ID in credentials.accessToken.',
    )
  }
  if (!clientSecret) {
    throw new Error(
      'PDD credentials: extra.clientSecret is required. ' +
        'Store the PDD client secret in credentials.extra.clientSecret.',
    )
  }

  return { clientId, clientSecret }
}

// Re-export for client import
export { PDD_ENDPOINT }
