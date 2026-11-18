/**
 * Jumia webhook verification and parsing.
 *
 * Jumia push notifications are delivered as JSON POST requests with an
 * HMAC-SHA256 signature in the `X-Jumia-Signature` header. The signature is
 * computed over the raw request body using the client secret as the key.
 *
 * Event types map to canonical resource types:
 *   - `product.*`    → products
 *   - `order.*`      → orders
 *   - `stock.*`      → inventory_levels
 *   - `shipment.*`   → fulfillments
 */

import crypto from 'crypto'
import type { WebhookEvent } from '../../schema/webhook'
import { PLATFORM_SLUG } from './constants'

/**
 * Verify a Jumia webhook signature.
 *
 * @param body         Raw request body string
 * @param signature    Value from the `X-Jumia-Signature` header
 * @param clientSecret Jumia client secret
 * @returns `true` if the signature is valid
 */
export function verifyWebhookSignature(
  body: string,
  signature: string,
  clientSecret: string,
): boolean {
  const expected = crypto
    .createHmac('sha256', clientSecret)
    .update(body)
    .digest('hex')
  if (expected.length !== signature.length) return false
  return crypto.timingSafeEqual(
    Buffer.from(expected, 'utf8'),
    Buffer.from(signature, 'utf8'),
  )
}

/** Jumia webhook payload shape. */
export interface RawJumiaWebhookPayload {
  event_type?: string
  data?: Record<string, unknown>
  seller_id?: string | number
  timestamp?: number | string
  [key: string]: unknown
}

type ResourceAction = { resourceType: WebhookEvent['resourceType']; action: WebhookEvent['action'] }

/**
 * Map a Jumia event_type to canonical resource type and action.
 */
function mapEventType(eventType: string): ResourceAction {
  const lower = eventType.toLowerCase()

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

  if (lower.includes('shipment') || lower.includes('delivery') || lower.includes('tracking')) {
    return { resourceType: 'fulfillments', action: 'updated' }
  }

  return { resourceType: 'unknown', action: 'unknown' }
}

/**
 * Parse a Jumia webhook payload into canonical WebhookEvent(s).
 */
export function parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const raw = payload as RawJumiaWebhookPayload
  const eventType = raw.event_type ?? 'unknown'
  const { resourceType, action } = mapEventType(String(eventType))

  const data = raw.data ?? {}
  const resourceId =
    String(data['product_id'] ?? data['order_id'] ?? data['shipment_id'] ?? data['sku'] ?? '')

  return [
    {
      id: raw.timestamp ? String(raw.timestamp) : undefined,
      platform: PLATFORM_SLUG,
      type: String(eventType).toLowerCase(),
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
 * Pulls the signature from the x-jumia-signature header and delegates to
 * verifyWebhookSignature(body, sig, secret).
 */
export function verifyWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  const sig = headers['x-jumia-signature'] ?? headers['X-Jumia-Signature']
  if (!sig) return false
  return verifyWebhookSignature(payload.toString('utf8'), sig, secret)
}

export const jumiaWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyWebhook,
  parseWebhookEvents: parseWebhookEvents,
}
