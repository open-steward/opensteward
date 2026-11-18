/**
 * JD.com webhook verification and event parsing.
 *
 * JD sends push notifications to a configured webhook URL. The payload
 * is signed using MD5 of the message body + app secret.
 *
 * JD webhook payload shape:
 *   {
 *     "type": 1,            // message type
 *     "id": "msg_001",      // message id
 *     "time": "2024-01-01 00:00:00",
 *     "content": { ... },   // event-specific data (JSON string or object)
 *     "sign": "..."         // MD5 signature
 *   }
 *
 * Message types:
 *   1  = order created
 *   2  = order paid
 *   3  = order shipped
 *   4  = order completed
 *   5  = order cancelled
 *   10 = product status changed
 *   11 = stock changed
 *   12 = product price changed
 *
 * Docs: https://jos.jd.com/
 */

import crypto from 'crypto'
import { timingSafeEqual } from 'node:crypto'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

/**
 * Verify a JD.com webhook payload. JD signs the payload with
 * MD5(content + appSecret) and includes it as the `sign` field.
 */
export function verifyJdWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    // JD sends the signature in the x-jd-sign header or in the body
    const headerSig =
      headers['x-jd-sign'] ?? headers['X-Jd-Sign']
    if (!headerSig) return false

    const expected = crypto
      .createHash('md5')
      .update(payload.toString('utf8') + secret)
      .digest('hex')
      .toUpperCase()

    const a = Buffer.from(headerSig.toUpperCase())
    const b = Buffer.from(expected)
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

// ── Message type to canonical mapping ──────────────────────────────────────────

interface PushMapping {
  resourceType: WebhookResourceType
  action: WebhookAction
  type: string
}

const MESSAGE_TYPE_MAP: Record<number, PushMapping> = {
  1:  { resourceType: 'orders', action: 'created', type: 'orders.created' },
  2:  { resourceType: 'orders', action: 'updated', type: 'orders.updated' },
  3:  { resourceType: 'fulfillments', action: 'updated', type: 'fulfillments.updated' },
  4:  { resourceType: 'orders', action: 'updated', type: 'orders.updated' },
  5:  { resourceType: 'orders', action: 'updated', type: 'orders.updated' },
  10: { resourceType: 'products', action: 'updated', type: 'products.updated' },
  11: { resourceType: 'inventory_levels', action: 'updated', type: 'inventory_levels.updated' },
  12: { resourceType: 'products', action: 'updated', type: 'products.updated' },
}

/**
 * Parse a JD.com push notification into canonical webhook events.
 */
export function parseJdWebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  const msgType = payload['type'] as number | undefined
  const content = payload['content'] as Record<string, unknown> | string | undefined
  const msgId = payload['id'] as string | undefined

  const mapping = msgType != null ? MESSAGE_TYPE_MAP[msgType] : undefined
  const resourceType: WebhookResourceType = mapping?.resourceType ?? 'unknown'
  const action: WebhookAction = mapping?.action ?? 'unknown'
  const type = mapping?.type ?? `unknown.type_${msgType ?? 'none'}`

  // Parse content if it's a JSON string
  let contentObj: Record<string, unknown> = {}
  if (typeof content === 'string') {
    try {
      contentObj = JSON.parse(content) as Record<string, unknown>
    } catch {
      contentObj = { raw: content }
    }
  } else if (content && typeof content === 'object') {
    contentObj = content
  }

  // Extract resource id
  const resourceId =
    (contentObj['order_id'] as string | undefined) ??
    (contentObj['orderId'] as string | undefined) ??
    (contentObj['sku_id'] as string | undefined) ??
    (contentObj['skuId'] as string | undefined) ??
    (contentObj['ware_id'] as string | undefined) ??
    ''

  return [
    {
      id: msgId,
      platform: 'jdcom',
      type,
      resourceType,
      action,
      resourceId: String(resourceId),
      payload,
    },
  ]
}

export const jdcomWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyJdWebhook,
  parseWebhookEvents: parseJdWebhookEvents,
}
