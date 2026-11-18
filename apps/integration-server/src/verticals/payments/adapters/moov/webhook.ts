/**
 * Moov webhook verification + event parsing.
 *
 * Moov signs every webhook delivery with HMAC-SHA512.  The signed string is:
 *   `${X-Timestamp}|${X-Nonce}|${X-Webhook-ID}`
 * and the result is hex-encoded in the `X-Signature` header.
 *
 * The signing secret is obtained from the Moov Dashboard when you create a
 * webhook endpoint.
 *
 * Reference implementations:
 *   https://docs.moov.io/guides/webhooks/check-webhook-signatures/
 *   https://github.com/moovfinancial/webhook-handler
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookEvent } from '../../schema/webhook'

export function verifyWebhook(
  _payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    if (!secret) return false

    const timestamp = headers['x-timestamp']
    const nonce = headers['x-nonce']
    const webhookId = headers['x-webhook-id']
    const signature = headers['x-signature']

    if (!timestamp || !nonce || !webhookId || !signature) return false

    const signedContent = `${timestamp}|${nonce}|${webhookId}`
    const expected = createHmac('sha512', secret).update(signedContent, 'utf8').digest('hex')

    const expectedBuf = Buffer.from(expected, 'hex')
    const signatureBuf = Buffer.from(signature, 'hex')

    if (expectedBuf.length === 0 || expectedBuf.length !== signatureBuf.length) return false

    return timingSafeEqual(expectedBuf, signatureBuf)
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
      platform: 'moov',
      type,
      resourceType: 'unknown',
      action: 'unknown',
      resourceId,
      payload,
    },
  ]
}

export const MoovWebhookHandler: WebhookHandler = {
  verifyWebhook,
  parseWebhookEvents,
}
