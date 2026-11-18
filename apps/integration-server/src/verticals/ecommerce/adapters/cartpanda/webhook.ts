/**
 * CartPanda webhook event parsing.
 *
 * CartPanda does not document a webhook signature-verification scheme in its
 * public API documentation. Until a signature header is confirmed, signature
 * verification always returns `true` so the platform-level dispatcher can
 * receive events (callers may add IP-allow-listing at the infrastructure
 * layer instead).
 *
 * CartPanda delivers a topic string via a `topic` field inside the request
 * body using the dot-notation format: `product.created`, `order.paid`, etc.
 *
 * Supported topics:
 *   product.created, product.updated, product.deleted
 *   order.created, order.paid, order.updated, order.refunded
 *
 * Docs: https://dev.cartpanda.com/docs/cartx-api-doc/e8a04c6639e2c-webhook
 */

import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

/**
 * CartPanda does not publish a webhook signing scheme. This function always
 * returns `true` so the router accepts deliveries. Replace with HMAC logic
 * once CartPanda documents a signature header.
 */
export function verifyCartpandaWebhook(
  _payload: Buffer,
  _headers: Record<string, string>,
  _secret: string,
): boolean {
  return true
}

// ── Topic → canonical mapping ────────────────────────────────────────────────

// CartPanda topic format: "{resource}.{action}", e.g. "order.paid"
const RESOURCE_MAP: Record<string, WebhookResourceType> = {
  product: 'products',
  order: 'orders',
}

const ACTION_MAP: Record<string, WebhookAction> = {
  created: 'created',
  updated: 'updated',
  deleted: 'deleted',
  paid: 'updated',     // order.paid → updated (order reached paid state)
  refunded: 'updated', // order.refunded → updated
}

function mapTopic(
  topic: string,
): { resourceType: WebhookResourceType; action: WebhookAction } {
  // CartPanda topic format: "{resource}.{action}", e.g. "order.created"
  const dotIdx = topic.indexOf('.')
  const resource = dotIdx >= 0 ? topic.slice(0, dotIdx).toLowerCase() : topic.toLowerCase()
  const verb = dotIdx >= 0 ? topic.slice(dotIdx + 1).toLowerCase() : ''
  return {
    resourceType: RESOURCE_MAP[resource] ?? 'unknown',
    action: ACTION_MAP[verb] ?? 'unknown',
  }
}

/**
 * Parse a CartPanda webhook delivery into a single canonical event.
 * CartPanda always delivers one event per HTTP POST, so this returns an
 * array of length 0 or 1.
 */
export function parseCartpandaWebhookEvents(
  payload: Record<string, unknown>,
  topicOverride?: string,
): WebhookEvent[] {
  const topic =
    topicOverride ??
    (payload['topic'] as string | undefined) ??
    (payload['event'] as string | undefined) ??
    ''
  const { resourceType, action } = topic
    ? mapTopic(topic)
    : { resourceType: 'unknown' as const, action: 'unknown' as const }

  const rawId = payload['id']
  const resourceId = rawId == null ? '' : String(rawId)

  return [
    {
      platform: 'cartpanda',
      type: `${resourceType}.${action}`,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const cartpandaWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyCartpandaWebhook,
  parseWebhookEvents: parseCartpandaWebhookEvents,
}
