/**
 * Lazada webhook verification and parsing.
 *
 * Lazada push notifications are delivered as JSON POST requests with an
 * HMAC-SHA256 signature in the `Authorization` header. The signature is
 * computed over the raw request body using the app secret as the key.
 *
 * Event types map to canonical resource types:
 *   - `product_*`   → products
 *   - `order_*`     → orders
 *   - `stock_*`     → inventory_levels
 *   - `logistics_*` → fulfillments
 */

import crypto from 'crypto'
import type { WebhookEvent } from '../../schema/webhook'
import { PLATFORM_SLUG } from './constants'

/**
 * Verify a Lazada webhook signature.
 *
 * @param body       Raw request body string
 * @param signature  Value from the `Authorization` header
 * @param appSecret  Lazada app secret
 * @returns `true` if the signature is valid
 */
export function verifyWebhookSignature(
  body: string,
  signature: string,
  appSecret: string,
): boolean {
  const expected = crypto
    .createHmac('sha256', appSecret)
    .update(body)
    .digest('hex')
    .toUpperCase()
  const sigUpper = signature.toUpperCase()
  if (expected.length !== sigUpper.length) return false
  return crypto.timingSafeEqual(
    Buffer.from(expected, 'utf8'),
    Buffer.from(sigUpper, 'utf8'),
  )
}

/** Lazada webhook payload shape. */
export interface RawLazadaWebhookPayload {
  message_type?: string
  data?: Record<string, unknown>
  seller_id?: string | number
  timestamp?: number | string
  [key: string]: unknown
}

type ResourceAction = { resourceType: WebhookEvent['resourceType']; action: WebhookEvent['action'] }

/**
 * Map a Lazada message_type to canonical resource type and action.
 */
function mapMessageType(messageType: string): ResourceAction {
  const lower = messageType.toLowerCase()

  if (lower.includes('product') && lower.includes('create')) {
    return { resourceType: 'products', action: 'created' }
  }
  if (lower.includes('product') && lower.includes('update')) {
    return { resourceType: 'products', action: 'updated' }
  }
  if (lower.includes('product') && lower.includes('delete')) {
    return { resourceType: 'products', action: 'deleted' }
  }
  if (lower.includes('product')) {
    return { resourceType: 'products', action: 'updated' }
  }

  if (lower.includes('order') && lower.includes('create')) {
    return { resourceType: 'orders', action: 'created' }
  }
  if (lower.includes('order') && lower.includes('cancel')) {
    return { resourceType: 'orders', action: 'updated' }
  }
  if (lower.includes('order')) {
    return { resourceType: 'orders', action: 'updated' }
  }

  if (lower.includes('stock') || lower.includes('inventory')) {
    return { resourceType: 'inventory_levels', action: 'updated' }
  }

  if (lower.includes('logistics') || lower.includes('shipment') || lower.includes('tracking')) {
    return { resourceType: 'fulfillments', action: 'updated' }
  }

  return { resourceType: 'unknown', action: 'unknown' }
}

/**
 * Parse a Lazada webhook payload into canonical WebhookEvent(s).
 */
export function parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const raw = payload as RawLazadaWebhookPayload
  const messageType = raw.message_type ?? 'unknown'
  const { resourceType, action } = mapMessageType(String(messageType))

  const data = raw.data ?? {}
  const resourceId =
    String(data['item_id'] ?? data['order_id'] ?? data['trade_order_id'] ?? data['seller_sku'] ?? '')

  return [
    {
      id: raw.timestamp ? String(raw.timestamp) : undefined,
      platform: PLATFORM_SLUG,
      type: String(messageType).toLowerCase(),
      resourceType,
      action,
      resourceId,
      tenantId: raw.seller_id ? String(raw.seller_id) : undefined,
      payload: payload,
    },
  ]
}


/**
 * Canonical-shape adapter for the unified webhook router.
 * Pulls the signature from the x-lazada-hmac-signature header and delegates to
 * verifyWebhookSignature(body, sig, secret).
 */
export function verifyWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  const sig = headers['x-lazada-hmac-signature'] ?? headers['X-Lazada-Hmac-Signature']
  if (!sig) return false
  return verifyWebhookSignature(payload.toString('utf8'), sig, secret)
}

export const lazadaWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyWebhook,
  parseWebhookEvents: parseWebhookEvents,
}
