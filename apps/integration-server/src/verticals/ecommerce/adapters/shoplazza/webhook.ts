/**
 * Shoplazza webhook verification and event parsing.
 *
 * Verification: Shoplazza signs the raw request body with HMAC-SHA256 (base64)
 * using the app's Client Secret, delivered in the
 * `X-Shoplazza-Hmac-Sha256` header. Compare using `timingSafeEqual`.
 *
 * Event parsing: Shoplazza sends the topic (e.g. `orders/create`) in the
 * `X-Shoplazza-Topic` header. Map these to the canonical
 * `{ resourceType, action }` shape.
 *
 * Docs: https://www.shoplazza.dev/reference/3develop-your-application-service
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

export function verifyShoplazzaWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const headerSig =
      headers['x-shoplazza-hmac-sha256'] ?? headers['X-Shoplazza-Hmac-Sha256']
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
  collections: 'collections',
  orders: 'orders',
  customers: 'customers',
  fulfillments: 'fulfillments',
  refunds: 'refunds',
  inventory_levels: 'inventory_levels',
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
  // Shoplazza topic format: "<resource>/<verb>", e.g. "orders/create"
  const [group = 'unknown', verb = 'unknown'] = topic.toLowerCase().split('/')
  return {
    resourceType: RESOURCE_MAP[group] ?? 'unknown',
    action: ACTION_MAP[verb] ?? 'unknown',
  }
}

/**
 * Parse a Shoplazza webhook delivery into zero-or-one canonical events.
 * The topic header is required to classify the delivery.
 */
export function parseShoplazzaWebhookEvents(
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
      platform: 'shoplazza',
      type: `${resourceType}.${action}`,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const shoplazzaWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyShoplazzaWebhook,
  parseWebhookEvents: parseShoplazzaWebhookEvents,
}
