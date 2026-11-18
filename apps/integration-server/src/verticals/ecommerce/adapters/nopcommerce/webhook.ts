/**
 * nopCommerce webhook verification and event parsing.
 *
 * nopCommerce (via the Web API plugin) supports webhooks that fire on
 * entity creation, update, and deletion. Webhook payloads are signed with
 * HMAC-SHA256 using a shared secret, placed in the `X-Nop-Webhook-Signature`
 * header.
 *
 * Event parsing: The webhook payload includes the entity type and action
 * either in the headers or in the JSON body. Map these to the canonical
 * `{ resourceType, action }` pair.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

export function verifyNopCommerceWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const headerSig =
      headers['x-nop-webhook-signature'] ?? headers['X-Nop-Webhook-Signature']
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
  product: 'products',
  category: 'collections',
  order: 'orders',
  customer: 'customers',
  discount: 'discounts',
}

function resolveResource(group: string): WebhookResourceType {
  return RESOURCE_MAP[group.toLowerCase()] ?? 'unknown'
}

const ACTION_MAP: Record<string, WebhookAction> = {
  created: 'created',
  create: 'created',
  inserted: 'created',
  updated: 'updated',
  update: 'updated',
  deleted: 'deleted',
  delete: 'deleted',
}

/**
 * Parse a nopCommerce webhook delivery into zero-or-one canonical events.
 *
 * nopCommerce delivers a single event per HTTP request.
 */
export function parseNopCommerceWebhookEvents(
  payload: Record<string, unknown>,
  topicHeader?: string,
): WebhookEvent[] {
  // Topic can come from header or body fields
  const topic =
    topicHeader ??
    (payload['event_type'] as string | undefined) ??
    (payload['topic'] as string | undefined) ??
    ''

  let resourceType: WebhookResourceType = 'unknown'
  let action: WebhookAction = 'unknown'

  if (topic) {
    // Expected format: "entity.action" e.g. "product.created"
    const [group = 'unknown', verb = 'unknown'] = topic.toLowerCase().split('.')
    resourceType = resolveResource(group)
    action = ACTION_MAP[verb] ?? 'unknown'
  }

  const rawId = payload['id'] ?? payload['entity_id']
  const resourceId = rawId == null ? '' : String(rawId)

  return [
    {
      platform: 'nopcommerce',
      type: `${resourceType}.${action}`,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const nopcommerceWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyNopCommerceWebhook,
  parseWebhookEvents: parseNopCommerceWebhookEvents,
}
