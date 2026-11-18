/**
 * BigCommerce webhook verification and event parsing.
 *
 * Verification: BigCommerce signs the raw request body with HMAC-SHA256
 * (base64) using the client secret and puts the signature in the
 * `X-Bc-Webhook-Hmac` header (or sometimes a custom header). Compare
 * using `timingSafeEqual`.
 *
 * Event parsing: BigCommerce webhooks include `scope` (e.g.
 * `store/order/created`) and the resource id in `data.id`. Map these to
 * canonical `{ resourceType, action }`.
 *
 * Docs: https://developer.bigcommerce.com/docs/integrations/webhooks
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

export function verifyBigCommerceWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const headerSig =
      headers['x-bc-webhook-hmac'] ?? headers['X-Bc-Webhook-Hmac']
    if (!headerSig) return false

    const expected = createHmac('sha256', secret).update(payload).digest('base64')
    const a = Buffer.from(headerSig)
    const b = Buffer.from(expected)
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

// ── Scope → canonical mapping ───────────────────────────────────────────────

const RESOURCE_MAP: Record<string, WebhookResourceType> = {
  product: 'products',
  category: 'collections',
  order: 'orders',
  customer: 'customers',
  shipment: 'fulfillments',
  inventory: 'inventory_levels',
  sku: 'variants',
}

const ACTION_MAP: Record<string, WebhookAction> = {
  created: 'created',
  updated: 'updated',
  deleted: 'deleted',
  statusUpdated: 'updated',
  inventoryUpdated: 'updated',
}

function mapScope(scope: string): { resourceType: WebhookResourceType; action: WebhookAction } {
  // BigCommerce scope format: "store/<resource>/<action>", e.g. "store/order/created"
  const parts = scope.toLowerCase().split('/')
  // parts[0] is "store", parts[1] is resource, parts[2] is action
  const resource = parts[1] ?? 'unknown'
  const action = parts[2] ?? 'unknown'
  return {
    resourceType: RESOURCE_MAP[resource] ?? 'unknown',
    action: ACTION_MAP[action] ?? 'unknown',
  }
}

/**
 * Parse a BigCommerce webhook delivery into zero-or-one canonical events.
 *
 * BigCommerce sends a single event per HTTP request with `scope` and `data`.
 */
export function parseBigCommerceWebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  const scope = (payload['scope'] as string | undefined) ?? ''
  const { resourceType, action } = scope
    ? mapScope(scope)
    : { resourceType: 'unknown' as const, action: 'unknown' as const }

  // BigCommerce puts the resource id in `data.id` or `data.orderId` etc.
  const data = (payload['data'] as Record<string, unknown>) ?? {}
  const rawId = data['id'] ?? data['orderId'] ?? ''
  const resourceId = rawId == null ? '' : String(rawId)

  return [
    {
      platform: 'bigcommerce',
      type: `${resourceType}.${action}`,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const bigcommerceWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyBigCommerceWebhook,
  parseWebhookEvents: parseBigCommerceWebhookEvents,
}
