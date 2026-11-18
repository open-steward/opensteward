/**
 * fabric webhook verification and event parsing.
 *
 * fabric delivers webhook events via HTTPS POST with HMAC-SHA256 signature
 * verification. The signature is sent in the `x-fabric-signature` header
 * and computed over the raw request body using the webhook secret.
 *
 * Event types follow the pattern `<resource>.<action>`, e.g.
 * `product.created`, `order.updated`, `inventory.adjusted`.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

/**
 * Verify a fabric webhook delivery by comparing the HMAC-SHA256 signature.
 */
export function verifyFabricWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const signature =
      headers['x-fabric-signature'] ??
      headers['X-Fabric-Signature']
    if (!signature) return false

    const expected = createHmac('sha256', secret).update(payload).digest('hex')
    const a = Buffer.from(signature)
    const b = Buffer.from(expected)
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

// ── Event type -> canonical mapping ──────────────────────────────────────────

const RESOURCE_MAP: Record<string, WebhookResourceType> = {
  product: 'products',
  variant: 'variants',
  category: 'collections',
  collection: 'collections',
  order: 'orders',
  customer: 'customers',
  fulfillment: 'fulfillments',
  shipment: 'fulfillments',
  refund: 'refunds',
  transaction: 'transactions',
  payment: 'transactions',
  inventory: 'inventory_levels',
  discount: 'discounts',
  promotion: 'discounts',
  location: 'locations',
}

const ACTION_MAP: Record<string, WebhookAction> = {
  created: 'created',
  updated: 'updated',
  deleted: 'deleted',
  adjusted: 'updated',
  fulfilled: 'updated',
  cancelled: 'updated',
  refunded: 'updated',
  shipped: 'updated',
  delivered: 'updated',
  paid: 'updated',
}

function mapEventType(
  eventType: string,
): { resourceType: WebhookResourceType; action: WebhookAction } {
  const dotIndex = eventType.indexOf('.')
  const resource = dotIndex > 0 ? eventType.slice(0, dotIndex) : eventType
  const verb = dotIndex > 0 ? eventType.slice(dotIndex + 1) : 'unknown'
  return {
    resourceType: RESOURCE_MAP[resource] ?? 'unknown',
    action: ACTION_MAP[verb] ?? 'unknown',
  }
}

/**
 * Parse a fabric webhook delivery into canonical events.
 */
export function parseFabricWebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  const eventType = (payload['event'] ?? payload['type'] ?? '') as string
  const { resourceType, action } = eventType
    ? mapEventType(eventType)
    : { resourceType: 'unknown' as const, action: 'unknown' as const }

  const data = payload['data'] as Record<string, unknown> | undefined
  const resourceId = String(data?.['id'] ?? payload['id'] ?? '')
  const merchantId = (payload['merchant_id'] ?? payload['account_id']) as string | undefined

  return [
    {
      platform: 'fabric',
      type: `${resourceType}.${action}`,
      resourceType,
      action,
      resourceId,
      tenantId: merchantId,
      payload,
    },
  ]
}

export const fabricWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyFabricWebhook,
  parseWebhookEvents: parseFabricWebhookEvents,
}
