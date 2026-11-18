/**
 * Haravan webhook verification and event parsing.
 *
 * Verification: `X-Haravan-Hmacsha256` carries base64(HMAC-SHA256(rawBody,
 * secret)). For a public Connect app the secret is the app's OAuth client
 * secret (there is no separate per-webhook signing secret).
 *
 * Docs: https://docs.haravan.com/docs/tutorials/webhooks/connect-webhook/
 * (Step 6: "we use hash_mac function with 'sha256' algorithms to encode a
 * string (data in webhook request + Client Secret) ... use base64 function
 * to encode this hash ... compare it with X-Haravan-Hmacsha256").
 *
 * Event parsing: the delivery body carries a `topic` field shaped
 * "<group>/<verb>" (Step 5: "topic: to know which notifications for which
 * events", e.g. "user/update"), mirrored onto the `X-Haravan-Topic` header by
 * the dispatcher that calls `parseWebhookEvents` in this vertical.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookEvent, WebhookResourceType, WebhookAction } from '../../schema/webhook'

export function verifyHaravanWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const headerSig = headers['x-haravan-hmacsha256']
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
  orders: 'orders',
  customers: 'customers',
  inventories: 'inventory_levels',
  inventory_levels: 'inventory_levels',
  collections: 'collections',
  custom_collections: 'collections',
  smart_collections: 'collections',
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
  // "<group>/<verb>", e.g. "orders/create" — same shape as the doc's
  // "user/update" example.
  const [group = 'unknown', verb = 'unknown'] = topic.toLowerCase().split('/')
  return {
    resourceType: RESOURCE_MAP[group] ?? 'unknown',
    action: ACTION_MAP[verb] ?? 'unknown',
  }
}

/**
 * Parse a Haravan webhook delivery into zero-or-one canonical events. Without
 * a `topic` this cannot be classified and comes back `unknown`.
 */
export function parseHaravanWebhookEvents(
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
      platform: 'haravan',
      type: `${resourceType}.${action}`,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const haravanWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyHaravanWebhook,
  parseWebhookEvents: parseHaravanWebhookEvents,
}
