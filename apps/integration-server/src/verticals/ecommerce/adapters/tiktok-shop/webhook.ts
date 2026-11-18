/**
 * TikTok Shop webhook verification and event parsing.
 *
 * TikTok Shop sends push notifications to a configured webhook URL. The
 * payload is signed with the app secret using HMAC-SHA256. The
 * signature is in the `Authorization` header.
 *
 * TikTok Shop webhook payload shape:
 *   {
 *     "type": 1,           // event type
 *     "shop_id": "12345",
 *     "data": { ... },     // event-specific data
 *     "timestamp": 1234567890
 *   }
 *
 * Event types:
 *   1 = order status change
 *   2 = package update
 *   3 = product status change
 *   4 = return/refund
 *   5 = seller authorization
 *   6 = promotion change
 *
 * Docs: https://partner.tiktokshop.com/
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

/**
 * Verify a TikTok Shop webhook payload. TikTok Shop signs the raw body with
 * HMAC-SHA256 using the app secret and sends the signature in the
 * `Authorization` header.
 */
export function verifyTikTokShopWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const headerSig =
      headers['authorization'] ?? headers['Authorization']
    if (!headerSig) return false

    const expected = createHmac('sha256', secret)
      .update(payload)
      .digest('hex')
    const a = Buffer.from(headerSig)
    const b = Buffer.from(expected)
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

// ── Event type → canonical mapping ─────────────────────────────────────────

interface EventMapping {
  resourceType: WebhookResourceType
  action: WebhookAction
  type: string
}

const EVENT_TYPE_MAP: Record<number, EventMapping> = {
  1: { resourceType: 'orders', action: 'updated', type: 'orders.updated' },
  2: { resourceType: 'fulfillments', action: 'updated', type: 'fulfillments.updated' },
  3: { resourceType: 'products', action: 'updated', type: 'products.updated' },
  4: { resourceType: 'refunds', action: 'created', type: 'refunds.created' },
  6: { resourceType: 'discounts', action: 'updated', type: 'discounts.updated' },
}

/**
 * Parse a TikTok Shop webhook notification into canonical webhook events.
 *
 * TikTok Shop delivers a single event per HTTP request, so this
 * returns an array of length 0 or 1.
 */
export function parseTikTokShopWebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  const eventType = payload['type'] as number | undefined
  const data = (payload['data'] ?? {}) as Record<string, unknown>
  const shopId = payload['shop_id'] as string | number | undefined

  const mapping = eventType != null ? EVENT_TYPE_MAP[eventType] : undefined
  const resourceType: WebhookResourceType = mapping?.resourceType ?? 'unknown'
  const action: WebhookAction = mapping?.action ?? 'unknown'
  const type = mapping?.type ?? `unknown.type_${eventType ?? 'none'}`

  // Extract a resource id from the data payload
  const resourceId =
    (data['order_id'] as string | undefined) ??
    (data['product_id'] as string | undefined) ??
    (data['package_id'] as string | undefined) ??
    ''

  return [
    {
      platform: 'tiktok-shop',
      type,
      resourceType,
      action,
      resourceId,
      tenantId: shopId != null ? String(shopId) : undefined,
      payload,
    },
  ]
}

export const tiktokShopWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyTikTokShopWebhook,
  parseWebhookEvents: parseTikTokShopWebhookEvents,
}
