/**
 * Instamojo webhook event parsing and verification.
 *
 * Instamojo authenticates webhooks with an HMAC-SHA1 Message Authentication
 * Code (MAC). The MAC is delivered as a `mac` field inside the
 * application/x-www-form-urlencoded POST body.
 *
 * Verification algorithm (per Instamojo docs):
 *   1. Parse the URL-encoded body into key-value pairs.
 *   2. Extract and remove the `mac` field — that is the expected digest.
 *   3. Sort the remaining keys alphabetically (case-insensitive).
 *   4. Concatenate the corresponding values with a pipe (`|`) separator.
 *   5. Compute HMAC-SHA1 of the concatenated string using the caller's
 *      private salt (the `secret` argument) as the key.
 *   6. Hex-encode the digest and compare to the received `mac` using
 *      constant-time comparison (prevents timing attacks).
 *
 * Fails closed: any missing/empty secret or missing MAC returns false.
 * Never throws.
 *
 * Reference:
 *   https://support.instamojo.com/hc/en-us/articles/207816249
 *   https://www.instamojo.com/blog/introducing-instamojo-webhooks/
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookEvent } from '../../schema/webhook'

export function verifyWebhook(
  payload: Buffer,
  _headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    if (!secret) return false

    // Parse the URL-encoded form body into a plain object.
    const params = new URLSearchParams(payload.toString('utf8'))
    const data: Record<string, string> = {}
    for (const [k, v] of params.entries()) {
      data[k] = v
    }

    // Extract the received MAC — fail closed if absent.
    const receivedMac = data['mac']
    if (!receivedMac) return false

    // Build the message: sort keys (excluding 'mac') case-insensitively,
    // then join their values with '|'.
    const sortedKeys = Object.keys(data)
      .filter((k) => k !== 'mac')
      .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))

    const message = sortedKeys.map((k) => data[k]).join('|')

    // Compute HMAC-SHA1 using the caller's salt.
    const computed = createHmac('sha1', secret).update(message).digest('hex')

    // Constant-time comparison — pad to equal lengths before comparing.
    const a = Buffer.from(computed, 'hex')
    const b = Buffer.from(receivedMac.toLowerCase(), 'hex')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export function parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const type =
    typeof payload['type'] === 'string'
      ? payload['type']
      : typeof payload['event'] === 'string'
        ? payload['event']
        : String(payload['type'] ?? '')
  const id = typeof payload['id'] === 'string' ? payload['id'] : undefined
  const dataObj =
    typeof payload['data'] === 'object' && payload['data'] !== null
      ? (payload['data'] as Record<string, unknown>)
      : {}
  const resourceId =
    typeof payload['resource_id'] === 'string'
      ? payload['resource_id']
      : typeof dataObj['id'] === 'string'
        ? dataObj['id']
        : ''
  return [
    {
      id,
      platform: 'instamojo',
      type,
      resourceType: 'unknown',
      action: 'unknown',
      resourceId,
      payload,
    },
  ]
}

export const InstamojoWebhookHandler: WebhookHandler = {
  verifyWebhook,
  parseWebhookEvents,
}
