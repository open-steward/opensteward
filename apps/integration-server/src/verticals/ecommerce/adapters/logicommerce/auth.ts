/**
 * LogiCommerce API Sync authentication.
 *
 * API Sync is not OAuth. The authentication guide
 * (https://api-sync.logicommerce.cloud/docs/guide.cfm?module=authentication&languageId=2)
 * documents two schemes built from the app's `appId` and `appKey`. This
 * adapter uses the first, "BASIC AUTHENTICATION":
 *
 *   "The token will be created by applying a cast to base64 on the binary
 *   result of a hash function (sha-256) of the concatenation of the appId and
 *   appKey credential values. token = base64(bin(hash(appId+appKey,'sha-256')))"
 *
 * and sends it as the guide's "HOW TO USE" says: "it will be necessary to
 * define as headers the following keys and values: appId: hCN3fdW
 * Authorization: Basic NdRA6F49RAHfa20kg5uZOcFQm1H+TxKfAqU5jOZri+8=".
 *
 * A connection stores the `appKey` as `credentials.accessToken` (the secret)
 * and the `appId` as `credentials.extra.appId`.
 */

import { createHash } from 'crypto'
import type { Credentials } from '@opensteward/shared'

/** base64(bin(hash(appId+appKey,'sha-256'))) */
export function apiSyncToken(appId: string, appKey: string): string {
  return createHash('sha256')
    .update(appId + appKey)
    .digest('base64')
}

/** The two headers every API Sync request carries. */
export function apiSyncHeaders(credentials: Credentials): { appId: string; Authorization: string } {
  const appId = credentials.extra?.['appId']
  if (typeof appId !== 'string' || appId === '') {
    throw new Error(
      'LogiCommerce connection has no appId (credentials.extra.appId); reconnect with the API Sync appId and appKey.',
    )
  }
  const appKey = credentials.accessToken
  if (!appKey) {
    throw new Error(
      'LogiCommerce connection has no appKey (credentials.accessToken); reconnect with the API Sync appId and appKey.',
    )
  }
  return { appId, Authorization: `Basic ${apiSyncToken(appId, appKey)}` }
}
