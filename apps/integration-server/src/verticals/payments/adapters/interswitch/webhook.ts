/**
 * Interswitch webhook event parsing and signature verification.
 *
 * Interswitch signs every webhook notification with HMAC-SHA512 using the
 * merchant's secret key. The resulting hex-encoded digest is sent in the
 * `X-Interswitch-Signature` header. Any request that is missing the header
 * or whose signature does not match is rejected (fail-closed).
 *
 * Reference: https://docs.interswitchgroup.com/docs/webhooks
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookEvent } from '../../schema/webhook'

const SIGNATURE_HEADER = 'x-interswitch-signature'

/**
 * Verify the HMAC-SHA512 signature on an Interswitch webhook delivery.
 *
 * Returns `true` only when all of the following hold:
 *  - `secret` is non-empty
 *  - the `X-Interswitch-Signature` header is present
 *  - the computed HMAC-SHA512(secret, rawBody) hex matches the header value
 *
 * Comparison is constant-time to prevent timing attacks.
 * Any error during computation returns `false` (fail-closed).
 */
export function verifyWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    if (!secret) return false

    // Header names are normalised to lowercase by most frameworks; handle both.
    const received =
      headers[SIGNATURE_HEADER] ?? headers['X-Interswitch-Signature']
    if (!received) return false

    const computed = createHmac('sha512', secret).update(payload).digest('hex')
    const a = Buffer.from(computed)
    const b = Buffer.from(received)

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
      platform: 'interswitch',
      type,
      resourceType: 'unknown',
      action: 'unknown',
      resourceId,
      payload,
    },
  ]
}

export const InterswitchWebhookHandler: WebhookHandler = {
  verifyWebhook,
  parseWebhookEvents,
}
