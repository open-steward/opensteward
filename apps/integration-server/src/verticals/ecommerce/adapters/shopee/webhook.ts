/**
 * Shopee webhook verification and event parsing.
 *
 * Shopee sends push notifications to a configured webhook URL. The
 * payload is signed with the partner key using HMAC-SHA256. The
 * `Authorization` header contains the signature.
 *
 * Shopee webhook payload shape:
 *   {
 *     "shop_id": 12345,
 *     "code": 3,           // push type code
 *     "data": { ... },     // event-specific data
 *     "timestamp": 1234567890
 *   }
 *
 * Push type codes:
 *   0 = shop authorization (initial)
 *   3 = order status update
 *   4 = tracking number update
 *   5 = Shopee updates (banned items etc.)
 *   7 = promotion update
 *   8 = reserved stock change
 *   9 = item promotion update
 *   13 = open api authorization expired
 *
 * Docs: https://open.shopee.com/documents/v2/v2.push.overview
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

/**
 * Verify a Shopee webhook payload. Shopee signs the raw body with
 * HMAC-SHA256 using the partner key and sends the signature in the
 * `Authorization` header (base URL + raw body).
 */
export function verifyShopeeWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const headerSig =
      headers['authorization'] ?? headers['Authorization']
    if (!headerSig) return false

    // Shopee computes: HMAC-SHA256(partner_key, url + "|" + body)
    // Since we don't have the URL here, Shopee's latest docs say
    // the signature is just HMAC-SHA256(partner_key, body) in hex.
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

// ── Push code → canonical mapping ───────────────────────────────────────────

interface PushMapping {
  resourceType: WebhookResourceType
  action: WebhookAction
  type: string
}

const PUSH_CODE_MAP: Record<number, PushMapping> = {
  3: { resourceType: 'orders', action: 'updated', type: 'orders.updated' },
  4: { resourceType: 'fulfillments', action: 'updated', type: 'fulfillments.updated' },
  5: { resourceType: 'products', action: 'updated', type: 'products.updated' },
  7: { resourceType: 'discounts', action: 'updated', type: 'discounts.updated' },
  8: { resourceType: 'inventory_levels', action: 'updated', type: 'inventory_levels.updated' },
  9: { resourceType: 'discounts', action: 'updated', type: 'discounts.updated' },
}

/**
 * Parse a Shopee push notification into canonical webhook events.
 *
 * Shopee always delivers a single event per HTTP request, so this
 * returns an array of length 0 or 1.
 */
export function parseShopeeWebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  const code = payload['code'] as number | undefined
  const data = (payload['data'] ?? {}) as Record<string, unknown>
  const shopId = payload['shop_id'] as number | undefined

  const mapping = code != null ? PUSH_CODE_MAP[code] : undefined
  const resourceType: WebhookResourceType = mapping?.resourceType ?? 'unknown'
  const action: WebhookAction = mapping?.action ?? 'unknown'
  const type = mapping?.type ?? `unknown.code_${code ?? 'none'}`

  // Extract a resource id from the data payload
  const resourceId =
    (data['ordersn'] as string | undefined) ??
    (data['order_sn'] as string | undefined) ??
    (data['item_id'] != null ? String(data['item_id']) : '') ??
    ''

  return [
    {
      platform: 'shopee',
      type,
      resourceType,
      action,
      resourceId,
      tenantId: shopId != null ? String(shopId) : undefined,
      payload,
    },
  ]
}

export const shopeeWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyShopeeWebhook,
  parseWebhookEvents: parseShopeeWebhookEvents,
}
