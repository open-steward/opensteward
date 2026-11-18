/**
 * SHOPLINE webhook verification and event parsing.
 *
 * Verification: SHOPLINE signs the raw request body with HMAC-SHA256 and puts
 * the hex signature in the `X-Shopline-Hmac-Sha256` header. Compare using
 * `timingSafeEqual` to prevent timing attacks.
 *
 * Event parsing: SHOPLINE sends the topic (e.g. `orders/create`) in the
 * `X-Shopline-Topic` header (or in the `topic` field of the payload). Map
 * these to the canonical `{ resourceType, action }` shape.
 *
 * Docs: https://developer.shopline.com/docs/apps/api-instructions-for-use/generate-and-verify-signatures/
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

export function verifyShoplineWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const headerSig =
      headers['x-shopline-hmac-sha256'] ?? headers['X-Shopline-Hmac-Sha256']
    if (!headerSig) return false

    // SHOPLINE computes HMAC-SHA256 of the raw body only (no timestamp mixed in
    // for webhook verification — that is only for API request signing).
    const expected = createHmac('sha256', secret).update(payload).digest('hex')
    const a = Buffer.from(headerSig)
    const b = Buffer.from(expected)
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

// ── Topic → canonical mapping ────────────────────────────────────────────────

const RESOURCE_MAP: Record<string, WebhookResourceType> = {
  products: 'products',
  product: 'products',
  collections: 'collections',
  collection: 'collections',
  orders: 'orders',
  order: 'orders',
  customers: 'customers',
  customer: 'customers',
  fulfillments: 'fulfillments',
  fulfillment: 'fulfillments',
  fulfillment_orders: 'fulfillments',
  refunds: 'refunds',
  refund: 'refunds',
  transactions: 'transactions',
  transaction: 'transactions',
  inventory_levels: 'inventory_levels',
  inventory_level: 'inventory_levels',
}

const ACTION_MAP: Record<string, WebhookAction> = {
  create: 'created',
  created: 'created',
  update: 'updated',
  updated: 'updated',
  delete: 'deleted',
  deleted: 'deleted',
}

function mapTopic(topic: string): { resourceType: WebhookResourceType; action: WebhookAction } {
  // SHOPLINE topic format: "<resource>/<verb>", e.g. "orders/create"
  const [group = 'unknown', verb = 'unknown'] = topic.toLowerCase().split('/')
  return {
    resourceType: RESOURCE_MAP[group] ?? 'unknown',
    action: ACTION_MAP[verb] ?? 'unknown',
  }
}

/**
 * Parse a SHOPLINE webhook delivery into zero-or-one canonical events. The
 * topic header (or body field) is required to classify the delivery.
 *
 * SHOPLINE always delivers a single event per HTTP request.
 */
export function parseShoplineWebhookEvents(
  payload: Record<string, unknown>,
  topicHeader?: string,
): WebhookEvent[] {
  const topic = topicHeader ?? (payload['topic'] as string | undefined) ?? ''
  const { resourceType, action } = topic
    ? mapTopic(topic)
    : { resourceType: 'unknown' as const, action: 'unknown' as const }

  const rawId = payload['id']
  const resourceId = rawId == null ? '' : String(rawId)

  return [
    {
      platform: 'shopline',
      type: `${resourceType}.${action}`,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const shoplineWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyShoplineWebhook,
  parseWebhookEvents: parseShoplineWebhookEvents,
}
