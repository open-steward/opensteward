/**
 * OpenCart webhook verification and event parsing.
 *
 * OpenCart does not have built-in webhook support out of the box. Most
 * OpenCart stores use extensions (e.g. OCMOD webhooks) that POST event
 * payloads with HMAC-SHA256 signatures. This module provides a generic
 * verification and parsing implementation compatible with common
 * OpenCart webhook extensions.
 *
 * Verification: HMAC-SHA256 of the raw body, base64-encoded, in
 * `X-Opencart-Hmac-Sha256` header.
 *
 * Event parsing: The payload carries `event` (e.g. `product.created`)
 * and a `data` object with the resource fields.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

export function verifyOpenCartWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const headerSig =
      headers['x-opencart-hmac-sha256'] ?? headers['X-Opencart-Hmac-Sha256']
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

// ── Topic mapping ───────────────────────────────────────────────────────────

const RESOURCE_MAP: Record<string, WebhookResourceType> = {
  product: 'products',
  order: 'orders',
  customer: 'customers',
  coupon: 'discounts',
  category: 'collections',
}

function resolveResource(group: string): WebhookResourceType {
  return RESOURCE_MAP[group] ?? 'unknown'
}

const ACTION_MAP: Record<string, WebhookAction> = {
  created: 'created',
  create: 'created',
  updated: 'updated',
  update: 'updated',
  deleted: 'deleted',
  delete: 'deleted',
}

function mapTopic(topic: string): {
  resourceType: WebhookResourceType
  action: WebhookAction
} {
  const [group = 'unknown', verb = 'unknown'] = topic.toLowerCase().split('.')
  return {
    resourceType: resolveResource(group),
    action: ACTION_MAP[verb] ?? 'unknown',
  }
}

/**
 * Parse an OpenCart webhook delivery into zero-or-one canonical events.
 * OpenCart webhook extensions typically deliver a single event per request.
 */
export function parseOpenCartWebhookEvents(
  payload: Record<string, unknown>,
  topicHeader?: string,
): WebhookEvent[] {
  const topic =
    topicHeader ??
    (payload['event'] as string | undefined) ??
    (payload['topic'] as string | undefined) ??
    ''
  const { resourceType, action } = topic
    ? mapTopic(topic)
    : { resourceType: 'unknown' as const, action: 'unknown' as const }

  const data = (payload['data'] ?? payload) as Record<string, unknown>
  const rawId = data['id'] ?? data['product_id'] ?? data['order_id'] ?? data['customer_id']
  const resourceId = rawId == null ? '' : String(rawId)

  return [
    {
      platform: 'opencart',
      type: `${resourceType}.${action}`,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const opencartWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyOpenCartWebhook,
  parseWebhookEvents: parseOpenCartWebhookEvents,
}
