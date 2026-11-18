/**
 * Noon webhook verification and parsing.
 *
 * Noon push notifications are delivered as JSON POST requests with an
 * HMAC-SHA256 signature in the `X-Noon-Signature` header. The signature
 * is computed over the raw request body using the webhook secret.
 *
 * Event types map to canonical resource types:
 *   - `product.*`     -> products
 *   - `order.*`       -> orders
 *   - `inventory.*`   -> inventory_levels
 *   - `fulfillment.*` -> fulfillments
 *   - `shipment.*`    -> fulfillments
 */

import crypto from 'crypto'
import type { WebhookEvent } from '../../schema/webhook'
import { PLATFORM_SLUG } from './constants'

/**
 * Verify a Noon webhook signature.
 *
 * @param body       Raw request body string
 * @param signature  Value from the `X-Noon-Signature` header
 * @param secret     Noon webhook secret
 * @returns `true` if the signature is valid
 */
export function verifyWebhookSignature(
  body: string,
  signature: string,
  secret: string,
): boolean {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex')
  if (expected.length !== signature.length) return false
  return crypto.timingSafeEqual(
    Buffer.from(expected, 'utf8'),
    Buffer.from(signature, 'utf8'),
  )
}

/** Noon webhook payload shape. */
export interface RawNoonWebhookPayload {
  event_type?: string
  data?: Record<string, unknown>
  seller_id?: string | number
  timestamp?: number | string
  event_id?: string
  [key: string]: unknown
}

type ResourceAction = { resourceType: WebhookEvent['resourceType']; action: WebhookEvent['action'] }

/**
 * Map a Noon event_type to canonical resource type and action.
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

  if (lower.includes('inventory') || lower.includes('stock')) {
    return { resourceType: 'inventory_levels', action: 'updated' }
  }

  if (lower.includes('fulfillment') || lower.includes('shipment') || lower.includes('tracking')) {
    return { resourceType: 'fulfillments', action: 'updated' }
  }

  if (lower.includes('customer') && lower.includes('create')) {
    return { resourceType: 'customers', action: 'created' }
  }
  if (lower.includes('customer')) {
    return { resourceType: 'customers', action: 'updated' }
  }

  return { resourceType: 'unknown', action: 'unknown' }
}

/**
 * Parse a Noon webhook payload into canonical WebhookEvent(s).
 */
export function parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const raw = payload as RawNoonWebhookPayload
  const eventType = raw.event_type ?? 'unknown'
  const { resourceType, action } = mapEventType(String(eventType))

  const data = raw.data ?? {}
  const resourceId =
    String(
      data['product_id'] ??
        data['order_id'] ??
        data['sku'] ??
        data['fulfillment_id'] ??
        data['customer_id'] ??
        '',
    )

  return [
    {
      id: raw.event_id ?? (raw.timestamp ? String(raw.timestamp) : undefined),
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
 * Pulls the signature from the x-noon-signature header and delegates to
 * verifyWebhookSignature(body, sig, secret).
 */
export function verifyWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  const sig = headers['x-noon-signature'] ?? headers['X-Noon-Signature']
  if (!sig) return false
  return verifyWebhookSignature(payload.toString('utf8'), sig, secret)
}

export const noonWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyWebhook,
  parseWebhookEvents: parseWebhookEvents,
}
