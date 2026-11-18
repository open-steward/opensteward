/**
 * Wix webhook verification and event parsing.
 *
 * Wix App Market webhook subscriptions deliver events with JWT-based
 * verification. The webhook payload includes the event type in the body.
 * Wix signs webhooks using a shared secret with HMAC-SHA256.
 *
 * Docs: https://dev.wix.com/docs/rest/articles/getting-started/webhooks
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

export function verifyWixWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const headerSig = headers['x-wix-signature'] ?? headers['X-Wix-Signature']
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

// ── Event type → canonical mapping ──────────────────────────────────────────

const RESOURCE_MAP: Record<string, WebhookResourceType> = {
  product: 'products',
  products: 'products',
  collection: 'collections',
  collections: 'collections',
  order: 'orders',
  orders: 'orders',
  contact: 'customers',
  contacts: 'customers',
  fulfillment: 'fulfillments',
  fulfillments: 'fulfillments',
  inventory: 'inventory_levels',
  coupon: 'discounts',
  coupons: 'discounts',
}

const ACTION_MAP: Record<string, WebhookAction> = {
  created: 'created',
  create: 'created',
  updated: 'updated',
  update: 'updated',
  deleted: 'deleted',
  delete: 'deleted',
  changed: 'updated',
}

function mapEventType(eventType: string): {
  resourceType: WebhookResourceType
  action: WebhookAction
} {
  // Wix event types can be like "wix.stores.product_created" or
  // "product/created" or "product_created"
  const normalized = eventType.toLowerCase().replace(/^wix\.stores\./, '')
  // Try splitting on "/" first, then "_"
  let parts: string[]
  if (normalized.includes('/')) {
    parts = normalized.split('/')
  } else {
    // Find last underscore to split resource from action
    const lastUnderscore = normalized.lastIndexOf('_')
    if (lastUnderscore > 0) {
      parts = [normalized.slice(0, lastUnderscore), normalized.slice(lastUnderscore + 1)]
    } else {
      parts = [normalized]
    }
  }

  const [resource = 'unknown', verb = 'unknown'] = parts
  return {
    resourceType: RESOURCE_MAP[resource] ?? 'unknown',
    action: ACTION_MAP[verb] ?? 'unknown',
  }
}

/**
 * Parse a Wix webhook delivery into canonical events.
 * Wix delivers a single event per HTTP request.
 */
export function parseWixWebhookEvents(
  payload: Record<string, unknown>,
  eventTypeHeader?: string,
): WebhookEvent[] {
  const eventType =
    eventTypeHeader ??
    (payload['eventType'] as string | undefined) ??
    (payload['event_type'] as string | undefined) ??
    ''

  const { resourceType, action } = eventType
    ? mapEventType(eventType)
    : { resourceType: 'unknown' as const, action: 'unknown' as const }

  // Wix payloads typically have the resource id at `data.id` or top-level `entityId`
  const data = payload['data'] as Record<string, unknown> | undefined
  const rawId = data?.['id'] ?? payload['entityId'] ?? payload['id']
  const resourceId = rawId == null ? '' : String(rawId)

  return [
    {
      platform: 'wix',
      type: `${resourceType}.${action}`,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const wixWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyWixWebhook,
  parseWebhookEvents: parseWixWebhookEvents,
}
