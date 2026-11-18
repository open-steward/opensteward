/**
 * Coupang WING API auth helpers: HMAC-SHA256 request signing.
 *
 * Coupang signs every request with a custom Authorization header. There is no
 * OAuth token flow: credentials are long-lived API keys issued in WING.
 *
 * Credentials layout:
 *   - `accessToken`        Coupang access key
 *   - `extra.secretKey`    Coupang secret key (the HMAC key)
 *   - `extra.vendorId`     Coupang vendor ID
 *
 * Signing, from the first-party examples at
 * https://developers.coupang.com/en/getting-started/creating-hmac-signature:
 *
 *   $datetime = date("ymd").'T'.date("His").'Z';          (GMT)
 *   $message  = $datetime.$method.$path.$query;
 *   $authorization = "CEA algorithm=HmacSHA256, access-key=".$accesskey.
 *                    ", signed-date=".$datetime.", signature=".$signature;
 *
 * `$query` is the query string exactly as sent (the Python example signs
 * `urllib.parse.urlencode({...})` and sends the same string), so the client
 * serialises the params once with {@link serializeQuery} and both signs and
 * sends that string.
 */

import { createHmac } from 'node:crypto'
import { HMAC_ALGORITHM } from './constants'

/**
 * Format a Date as the signed-date Coupang documents: UTC `yyMMdd'T'HHmmss'Z'`
 * (the PHP example's `date("ymd").'T'.date("His").'Z'` in GMT).
 */
export function formatDatetime(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const yy = String(date.getUTCFullYear()).slice(-2)
  const MM = pad(date.getUTCMonth() + 1)
  const dd = pad(date.getUTCDate())
  const HH = pad(date.getUTCHours())
  const mm = pad(date.getUTCMinutes())
  const ss = pad(date.getUTCSeconds())
  return `${yy}${MM}${dd}T${HH}${mm}${ss}Z`
}

/**
 * Serialise query params in the order given, URL-encoded as
 * `application/x-www-form-urlencoded` (the Python example's `urlencode`).
 * Null and undefined values are left out. The client sends this string AND
 * signs it, so the two can never differ.
 */
export function serializeQuery(params: Record<string, unknown> | undefined): string {
  const search = new URLSearchParams()
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v === undefined || v === null) continue
    search.append(k, String(v))
  }
  return search.toString()
}

/**
 * Compute the HMAC-SHA256 signature for a Coupang API request.
 *
 * @param secretKey   Coupang secret key
 * @param datetime    signed-date, from {@link formatDatetime}
 * @param method      HTTP method (GET, POST, PUT, DELETE)
 * @param path        Request path (e.g. "/v2/providers/seller_api/...")
 * @param query       The query string as sent, without "?" (empty if none)
 * @returns           Hex-encoded HMAC-SHA256 signature
 */
export function buildSignature(
  secretKey: string,
  datetime: string,
  method: string,
  path: string,
  query: string,
): string {
  const message = datetime + method + path + query
  return createHmac('sha256', secretKey).update(message).digest('hex')
}

/**
 * Build the full Authorization header value for a Coupang API request.
 *
 * @param accessKey   Coupang access key
 * @param secretKey   Coupang secret key
 * @param method      HTTP method
 * @param path        Request path (no query string)
 * @param query       The query string as sent, from {@link serializeQuery}
 * @param date        Optional override for the signing datetime
 */
export function buildAuthorizationHeader(
  accessKey: string,
  secretKey: string,
  method: string,
  path: string,
  query = '',
  date: Date = new Date(),
): string {
  const datetime = formatDatetime(date)
  const signature = buildSignature(secretKey, datetime, method.toUpperCase(), path, query)

  return `CEA algorithm=${HMAC_ALGORITHM}, access-key=${accessKey}, signed-date=${datetime}, signature=${signature}`
}
