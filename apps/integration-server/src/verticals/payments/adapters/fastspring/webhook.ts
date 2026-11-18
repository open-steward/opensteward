/**
 * FastSpring signs each webhook delivery with HMAC-SHA256 over the raw
 * request body using the store's configured HMAC secret. The digest is
 * base64-encoded and shipped in the `X-FS-Signature` header.
 *
 * A delivery is a single JSON document `{ "events": [ … ] }`; each event
 * carries `id`, `type` (dot-notation, e.g. `order.completed`), `live`,
 * `processed`, `created` (epoch millis) and a `data` object holding the
 * resource. One POST may contain multiple events.
 *
 * Docs: https://developer.fastspring.com/docs/message-security
 *       https://developer.fastspring.com/reference/webhooks-overview
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

/** First dot-notation segment → canonical resource type. */
const RESOURCE_MAP: Record<string, WebhookResourceType> = {
  order: 'charges',
  subscription: 'subscriptions',
  account: 'customers',
  return: 'refunds',
}

/** Trailing verb segment → canonical action. */
const ACTION_MAP: Record<string, WebhookAction> = {
  completed: 'succeeded',
  failed: 'failed',
  canceled: 'cancelled',
  cancelled: 'cancelled',
  created: 'created',
  updated: 'updated',
  activated: 'created',
  deactivated: 'cancelled',
  paused: 'updated',
  resumed: 'updated',
  pending: 'created',
}

function classify(eventType: string): {
  resourceType: WebhookResourceType
  action: WebhookAction
} {
  const lowered = eventType.toLowerCase()
  const parts = lowered.split('.')
  if (parts.length < 2) return { resourceType: 'unknown', action: 'unknown' }
  const head = parts[0]
  const verb = parts[parts.length - 1]
  return {
    resourceType: RESOURCE_MAP[head] ?? 'unknown',
    action: ACTION_MAP[verb] ?? 'unknown',
  }
}

export function verifyFastspringWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    if (!secret) return false
    const sig = headers['x-fs-signature'] ?? headers['X-FS-Signature']
    if (!sig) return false
    const expected = createHmac('sha256', secret).update(payload).digest('base64')
    const a = Buffer.from(sig, 'base64')
    const b = Buffer.from(expected, 'base64')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

/** Extract a stable resource id from a FastSpring event's `data` block. */
function resourceIdOf(data: Record<string, unknown>): string {
  return String(
    data['id'] ?? data['order'] ?? data['subscription'] ?? data['account'] ?? data['reference'] ?? '',
  )
}

export function parseFastspringWebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  const events = Array.isArray(payload['events'])
    ? (payload['events'] as Array<Record<string, unknown>>)
    : []
  return events.map((evt) => {
    const eventType = String(evt['type'] ?? '')
    const data = (evt['data'] as Record<string, unknown> | undefined) ?? {}
    const { resourceType, action } = classify(eventType)
    return {
      id: evt['id'] != null ? String(evt['id']) : undefined,
      platform: 'fastspring',
      type: eventType,
      resourceType,
      action,
      resourceId: resourceIdOf(data),
      payload: evt,
    }
  })
}

export const FastspringWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyFastspringWebhook,
  parseWebhookEvents: parseFastspringWebhookEvents,
}
