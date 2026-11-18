/**
 * Tokopedia webhook verification and event parsing.
 *
 * Tokopedia sends webhook notifications to a configured URL. The
 * payload is verified using a shared secret. Tokopedia webhooks
 * carry a `type` field indicating the event kind.
 *
 * Tokopedia webhook payload shape:
 *   {
 *     "fs_id": 12345,
 *     "type": "order_notification",
 *     "shop_id": 67890,
 *     "data": { ... }
 *   }
 *
 * Webhook types:
 *   - order_notification — order status change
 *   - product_notification — product update
 *   - stock_notification — stock change
 *   - shipping_notification — shipping status update
 *
 * Docs: https://developer.tokopedia.com/openapi/guide/#/webhook
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

/**
 * Verify a Tokopedia webhook payload. Tokopedia signs the raw body
 * with HMAC-SHA256 using the app secret and sends the signature in
 * the `X-Tokopedia-Hmac-SHA256` header.
 */
export function verifyTokopediaWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const headerSig =
      headers['x-tokopedia-hmac-sha256'] ??
      headers['X-Tokopedia-Hmac-SHA256'] ??
      headers['X-TOKOPEDIA-HMAC-SHA256']
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

// ── Type → canonical mapping ────────────────────────────────────────────────

interface WebhookMapping {
  resourceType: WebhookResourceType
  action: WebhookAction
  type: string
}

const WEBHOOK_TYPE_MAP: Record<string, WebhookMapping> = {
  order_notification: { resourceType: 'orders', action: 'updated', type: 'orders.updated' },
  product_notification: { resourceType: 'products', action: 'updated', type: 'products.updated' },
  stock_notification: { resourceType: 'inventory_levels', action: 'updated', type: 'inventory_levels.updated' },
  shipping_notification: { resourceType: 'fulfillments', action: 'updated', type: 'fulfillments.updated' },
  product_creation: { resourceType: 'products', action: 'created', type: 'products.created' },
  order_creation: { resourceType: 'orders', action: 'created', type: 'orders.created' },
}

/**
 * Parse a Tokopedia webhook notification into canonical webhook events.
 *
 * Tokopedia delivers a single event per HTTP request, so this returns
 * an array of length 0 or 1.
 */
export function parseTokopediaWebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  const eventType = payload['type'] as string | undefined
  const data = (payload['data'] ?? {}) as Record<string, unknown>
  const shopId = payload['shop_id'] as number | undefined
  const fsId = payload['fs_id'] as number | undefined

  const mapping = eventType ? WEBHOOK_TYPE_MAP[eventType] : undefined
  const resourceType: WebhookResourceType = mapping?.resourceType ?? 'unknown'
  const action: WebhookAction = mapping?.action ?? 'unknown'
  const type = mapping?.type ?? `unknown.${eventType ?? 'none'}`

  // Extract a resource id from the data payload
  const resourceId =
    (data['order_id'] != null ? String(data['order_id']) : '') ||
    (data['product_id'] != null ? String(data['product_id']) : '') ||
    ''

  return [
    {
      platform: 'tokopedia',
      type,
      resourceType,
      action,
      resourceId,
      tenantId: shopId != null ? String(shopId) : (fsId != null ? String(fsId) : undefined),
      payload,
    },
  ]
}

export const tokopediaWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyTokopediaWebhook,
  parseWebhookEvents: parseTokopediaWebhookEvents,
}
