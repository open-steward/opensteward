/**
 * Commerce Layer webhook verification and event parsing.
 *
 * Verification: Commerce Layer signs webhook payloads with HMAC-SHA256 using
 * the shared secret. The signature is sent in the `X-CommerceLayer-Signature`
 * header. Compare using `timingSafeEqual`.
 *
 * Event parsing: Commerce Layer sends a topic string in the payload
 * (e.g. `orders.create`, `skus.update`). Each delivery contains one event.
 *
 * Docs: https://docs.commercelayer.io/core/callbacks-security
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

export function verifyCLWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const headerSig =
      headers['x-commercelayer-signature'] ?? headers['X-CommerceLayer-Signature']
    if (!headerSig) return false

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
  skus: 'products',
  sku_lists: 'collections',
  stock_locations: 'locations',
  stock_items: 'inventory_levels',
  customers: 'customers',
  orders: 'orders',
  shipments: 'fulfillments',
  returns: 'refunds',
  captures: 'transactions',
  authorizations: 'transactions',
  refunds: 'transactions',
  voids: 'transactions',
  promotions: 'discounts',
  coupon_codes: 'discounts',
  gift_cards: 'discounts',
}

const ACTION_MAP: Record<string, WebhookAction> = {
  create: 'created',
  update: 'updated',
  destroy: 'deleted',
}

function mapTopic(topic: string): { resourceType: WebhookResourceType; action: WebhookAction } {
  // Commerce Layer topic format: "<resource>.<verb>", e.g. "orders.create"
  const [resource = 'unknown', verb = 'unknown'] = topic.toLowerCase().split('.')
  return {
    resourceType: RESOURCE_MAP[resource] ?? 'unknown',
    action: ACTION_MAP[verb] ?? 'unknown',
  }
}

/**
 * Parse a Commerce Layer webhook delivery into canonical events.
 *
 * Commerce Layer delivers one event per HTTP request. The payload contains:
 *   { data: { id, type, attributes, ... }, included: [...] }
 */
export function parseCLWebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  const topic =
    (payload['topic'] as string | undefined) ??
    (payload['__topic'] as string | undefined) ??
    ''
  const { resourceType, action } = topic
    ? mapTopic(topic)
    : { resourceType: 'unknown' as const, action: 'unknown' as const }

  // Commerce Layer puts the resource under `data`
  const data = payload['data'] as Record<string, unknown> | undefined
  const resourceId = data?.['id'] != null ? String(data['id']) : ''

  return [
    {
      platform: 'commercelayer',
      type: `${resourceType}.${action}`,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const commercelayerWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyCLWebhook,
  parseWebhookEvents: parseCLWebhookEvents,
}
