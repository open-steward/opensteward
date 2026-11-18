/**
 * Shopify webhook verification and event parsing.
 *
 * Verification: Shopify signs the raw request body with HMAC-SHA256 (base64)
 * using the shared webhook secret, and puts the signature in the
 * `X-Shopify-Hmac-Sha256` header. Compare using `timingSafeEqual`.
 *
 * Event parsing: Shopify sends the topic (e.g. `orders/create`) in
 * `X-Shopify-Topic`. Map these to the canonical `{ resourceType, action }`
 * shape.
 *
 * Docs: https://shopify.dev/docs/apps/build/webhooks
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

export function verifyShopifyWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const headerSig = headers['x-shopify-hmac-sha256'] ?? headers['X-Shopify-Hmac-Sha256']
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

// ── Topic → canonical mapping ────────────────────────────────────────────────

const RESOURCE_MAP: Record<string, WebhookResourceType> = {
  products: 'products',
  product_listings: 'products',
  collections: 'collections',
  orders: 'orders',
  customers: 'customers',
  fulfillments: 'fulfillments',
  refunds: 'refunds',
  transactions: 'transactions',
  inventory_levels: 'inventory_levels',
  inventory_items: 'inventory_levels',
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
  // Shopify topic format: "<group>/<verb>", e.g. "orders/create"
  const [group = 'unknown', verb = 'unknown'] = topic.toLowerCase().split('/')
  return {
    resourceType: RESOURCE_MAP[group] ?? 'unknown',
    action: ACTION_MAP[verb] ?? 'unknown',
  }
}

/**
 * Parse a Shopify webhook delivery into zero-or-one canonical events. The
 * topic header is required to classify the delivery — without it we return
 * `unknown`.
 *
 * Shopify always delivers a single event per HTTP request, so this returns an
 * array of length 0 or 1.
 */
export function parseShopifyWebhookEvents(
  payload: Record<string, unknown>,
  topicHeader?: string,
): WebhookEvent[] {
  const topic = topicHeader ?? (payload['topic'] as string | undefined) ?? ''
  const { resourceType, action } = topic ? mapTopic(topic) : { resourceType: 'unknown' as const, action: 'unknown' as const }

  // Shopify payloads place the resource id at the top level as `id`.
  const rawId = payload['id']
  const resourceId = rawId == null ? '' : String(rawId)

  return [
    {
      platform: 'sellfy',
      type: `${resourceType}.${action}`,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const shopifyWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyShopifyWebhook,
  parseWebhookEvents: parseShopifyWebhookEvents,
}
